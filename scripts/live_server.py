

from __future__ import annotations

import json
import os
import sys
import threading
import time
import uuid
from collections import deque
from datetime import datetime
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

import cv2
from flask import Flask, Response, jsonify
from ultralytics import YOLO

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from zone_check import (  # noqa: E402
    PersonTracker,
    ZONE_LABEL,
    draw_person,
    draw_zones,
    foot_point,
    load_full_config,
    people_from_result,
    process_result,
    validate_nesting,
    zone_pixels,
)

CONFIG_PATH = SCRIPTS_DIR / "config.json"
GEOFENCE_API = os.environ.get("GEOFENCE_API", "http://127.0.0.1:4000/api/geofence/live")
EVENTS_INGEST_API = os.environ.get("EVENTS_INGEST_API", "http://127.0.0.1:4000/api/events/ingest")
DEFAULT_RTSP = "rtsp://PoolsEye:PoolsEyeCapstone@192.168.1.20:554/stream1"

app = Flask(__name__)

_lock = threading.Lock()
_zcfg_lock = threading.Lock()
_latest_jpeg: bytes | None = None
_latest_reports: list = []
_event_log: deque = deque(maxlen=100)
_running = True
_zcfg: dict | None = None
_source_kind = "rtsp"
# Dedupe: same person + event + zone logs once until something changes
_last_logged_by_person: dict[int, tuple[str, str]] = {}
# Cross-track flicker: same event+zone within this window is skipped
_EVENT_DEDUPE_SEC = 8.0
_last_logged_global: tuple[str, str, float] | None = None

# Crossing text from zone_check → dashboard event shape
EVENT_CATALOG = {
    "RED BOUNDARY CROSSED": {
        "type": "alarm",
        "code": "INT",
        "title": "Red Zone Intrusion",
        "severity": "HIGH",
        "category": "intrusion",
    },
    "DEEP POOL ENTRY": {
        "type": "alarm",
        "code": "DP",
        "title": "Deep-Pool Entry",
        "severity": "HIGH",
        "category": "deep-water",
    },
    "ENTERED POOL AREA": {
        "type": "info",
        "code": "YL",
        "title": "Entered Monitored Area",
        "severity": "LOW",
        "category": "yellow",
    },
    "LEFT DEEP POOL": {
        "type": "info",
        "code": "DP",
        "title": "Left Deep Pool",
        "severity": "LOW",
        "category": "deep-water",
    },
    "LEFT RED ZONE": {
        "type": "info",
        "code": "INT",
        "title": "Left Red Zone",
        "severity": "LOW",
        "category": "intrusion",
    },
    "LEFT POOL AREA": {
        "type": "safe",
        "code": "CLR",
        "title": "Left Pool Area",
        "severity": "LOW",
        "category": "clear",
    },
}


def sync_event_to_backend(entry: dict):
    """Persist live detection events to the Express backend for Event history."""
    try:
        payload = json.dumps(entry).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        secret = os.environ.get("EVENTS_INGEST_SECRET")
        if secret:
            headers["X-Events-Secret"] = secret
        req = Request(EVENTS_INGEST_API, data=payload, headers=headers, method="POST")
        urlopen(req, timeout=2)
    except (URLError, TimeoutError, OSError):
        pass


def push_event(person_id: int, zone: str, event_name: str, is_alert: bool):
    """Append a dashboard-ready event when a zone crossing fires (once per change)."""
    global _last_logged_global
    pid = int(person_id)
    key = (str(event_name), str(zone))
    now_ts = time.time()

    with _lock:
        if _last_logged_by_person.get(pid) == key:
            return None
        prev_global = _last_logged_global
        if (
            prev_global is not None
            and prev_global[0] == key[0]
            and prev_global[1] == key[1]
            and (now_ts - prev_global[2]) < _EVENT_DEDUPE_SEC
        ):
            # Same sighting under a new YOLO track id — keep one log entry
            _last_logged_by_person[pid] = key
            return None
        _last_logged_by_person[pid] = key
        _last_logged_global = (key[0], key[1], now_ts)

    meta = EVENT_CATALOG.get(event_name, {
        "type": "warn" if is_alert else "info",
        "code": "EVT",
        "title": event_name,
        "severity": "MEDIUM" if is_alert else "LOW",
        "category": "zone",
    })
    now = datetime.now()
    entry = {
        "id": f"evt-{uuid.uuid4().hex[:10]}",
        "type": meta["type"],
        "code": meta["code"],
        "title": meta["title"],
        "meta": f"{ZONE_LABEL.get(zone, zone)} · Person #{person_id} · CAM-01",
        "time": now.strftime("%I:%M:%S %p").lstrip("0"),
        "date": "Today",
        "status": "pending" if is_alert else "resolved",
        "severity": meta["severity"],
        "category": meta["category"],
        "camera": "CAM-01",
        "person_id": person_id,
        "zone": zone,
        "zone_label": ZONE_LABEL.get(zone, zone),
        "event": event_name,
        "is_alert": bool(is_alert),
        "ts": now.timestamp(),
    }
    with _lock:
        _event_log.appendleft(entry)
    sync_event_to_backend(entry)
    return entry


def resize_max_width(frame, max_width: int):
    if max_width <= 0:
        return frame
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / w
    return cv2.resize(frame, (max_width, int(h * scale)), interpolation=cv2.INTER_AREA)


def read_fresh_frame(cap, flush: int):
    """Drop buffered frames so the dashboard shows near-live video, not a backlog."""
    flush = max(0, int(flush))
    if flush <= 0:
        return cap.read()
    for _ in range(flush):
        if not cap.grab():
            return False, None
    return cap.retrieve()


def annotate_frame(frame, model, zcfg, tracker, conf, kpt_conf, imgsz: int):
    """Run pose track + zone overlays; return BGR frame, reports, and draw cache."""
    results = model.track(
        source=frame,
        conf=conf,
        imgsz=imgsz,
        persist=True,
        verbose=False,
        stream=False,
    )
    if not results:
        out = frame.copy()
        h, w = out.shape[:2]
        draw_zones(out, zone_pixels(zcfg, w, h))
        return out, [], []

    annotated, reports = process_result(results[0], zcfg, tracker, kpt_conf, persist=True)

    draw_cache = []
    for track_id, xyxy, kxy, kcf in people_from_result(results[0]):
        fx, fy, src, left, right = foot_point(xyxy, kxy, kcf, kpt_conf)
        zone = next((r["zone"] for r in reports if r["id"] == track_id), "clear")
        event = next((r.get("event") for r in reports if r["id"] == track_id), None)
        draw_cache.append({
            "track_id": track_id,
            "xyxy": xyxy,
            "foot": (fx, fy),
            "src": src,
            "left": left,
            "right": right,
            "kxy": kxy,
            "kcf": kcf,
            "zone": zone,
            "event": event,
        })
    return annotated, reports, draw_cache


def redraw_cached(frame, zcfg, draw_cache, kpt_conf):
    """Current video + zones + last known people (no YOLO)."""
    out = frame.copy()
    h, w = out.shape[:2]
    draw_zones(out, zone_pixels(zcfg, w, h))
    for item in draw_cache:
        draw_person(
            out,
            item["track_id"],
            item["xyxy"],
            item["foot"],
            item["src"],
            item["left"],
            item["right"],
            item["kxy"],
            item["kcf"],
            kpt_conf,
            item["zone"],
            item["event"],
        )
    return out


def current_zcfg(fallback: dict) -> dict:
    with _zcfg_lock:
        return _zcfg if _zcfg is not None else fallback


def merge_detection(detection: dict, fallback: dict) -> dict:
    merged = dict(fallback)
    merged.update(detection)
    merged["coord_space"] = detection.get("coord_space", fallback.get("coord_space", "editor"))
    merged["editor_size"] = detection.get("editor_size", fallback.get("editor_size", [1000, 512]))
    merged["orange_proximity"] = detection.get(
        "orange_proximity", fallback.get("orange_proximity", 0.02)
    )
    return merged


def geofence_poll_loop(fallback: dict):
    """Pull dashboard geofence coordinates so CCTV overlays track the editor."""
    global _zcfg
    last_revision = None
    while _running:
        try:
            with urlopen(GEOFENCE_API, timeout=2) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            detection = data.get("detection")
            revision = data.get("revision")
            if isinstance(detection, dict) and revision != last_revision:
                merged = merge_detection(detection, fallback)
                with _zcfg_lock:
                    _zcfg = merged
                last_revision = revision
                print(f"[stream] geofence rev={revision} synced from dashboard")
        except (URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError):
            pass
        time.sleep(0.4)


def load_camera_settings(cfg: dict) -> dict:
    cam = cfg.get("CAMERA") or {}
    fallback = cam.get("fallback_webcam", True)
    if isinstance(fallback, str):
        fallback = fallback.strip().lower() not in {"0", "false", "no"}
    source = str(cam.get("source") or "rtsp").strip().lower()
    if source in {"0", "webcam", "laptop"}:
        source = "webcam"
    return {
        "source": source,
        "rtsp_url": cam.get("rtsp_url") or DEFAULT_RTSP,
        "webcam_index": int(cam.get("webcam_index", 0)),
        "fallback_webcam": bool(fallback),
    }


def resolve_capture_kind(settings: dict) -> str:
    if settings["source"] == "webcam":
        return "webcam"
    return "rtsp"


def open_capture(kind: str, settings: dict):
    if kind == "webcam":
        index = settings["webcam_index"]
        print(f"[stream] opening webcam index {index}")
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap.release()
            cap = cv2.VideoCapture(index)
        return cap

    print("[stream] connecting to RTSP...")
    # Same open path as test_tapo.py (default backend, not CAP_FFMPEG).
    cap = cv2.VideoCapture(settings["rtsp_url"])
    return cap


def capture_loop(cfg: dict):
    global _latest_jpeg, _latest_reports, _running, _zcfg, _source_kind

    pose_cfg = cfg.get("POSE", {})
    track_cfg = cfg.get("TRACKING", {})
    fallback_zcfg = cfg["ZONES"]
    camera = load_camera_settings(cfg)
    with _zcfg_lock:
        if _zcfg is None:
            _zcfg = fallback_zcfg

    model_name = pose_cfg.get("model") or "yolo11n-pose.pt"
    conf = float(pose_cfg.get("confidence_threshold", 0.25))
    kpt_conf = float(pose_cfg.get("keypoint_confidence", 0.3))
    imgsz = int(pose_cfg.get("imgsz", 416))
    infer_every_n = max(1, int(pose_cfg.get("infer_every_n", 3)))
    max_width = int(pose_cfg.get("max_width", 960))
    jpeg_quality = int(pose_cfg.get("jpeg_quality", 65))
    rtsp_flush = int(pose_cfg.get("rtsp_flush", 2))

    print(f"[stream] loading pose model {model_name}")
    model = YOLO(model_name)

    tracker = PersonTracker(
        cooldown_sec=float(track_cfg.get("alert_cooldown_sec", 3.0)),
        lost_sec=float(track_cfg.get("lost_track_sec", 2.0)),
    )

    for warn in validate_nesting(current_zcfg(fallback_zcfg)):
        print(f"[stream] WARN {warn}")

    print(
        f"[stream] speed: imgsz={imgsz} infer_every_n={infer_every_n} "
        f"max_width={max_width} jpeg={jpeg_quality} flush={rtsp_flush}"
    )
    print("[stream] nested Yellow ⊃ Red ⊃ Orange | pose + crossing alerts")

    frame_i = 0
    draw_cache: list = []
    last_reports: list = []

    while _running:
        kind = resolve_capture_kind(camera)
        _source_kind = kind
        cap = open_capture(kind, camera)

        if not cap.isOpened() and kind == "rtsp" and camera["fallback_webcam"]:
            print("[stream] RTSP open failed — falling back to laptop webcam")
            cap.release()
            kind = "webcam"
            _source_kind = kind
            cap = open_capture(kind, camera)

        if not cap.isOpened():
            if kind == "webcam":
                print("[stream] webcam open failed — check that a camera is connected. Retry in 5s...")
            else:
                print("[stream] open failed — check IP / RTSP / password. Retry in 5s...")
            time.sleep(5)
            continue

        print(f"[stream] connected ({kind}) — annotating frames for dashboard")
        fail = 0
        flush = 0 if kind == "webcam" else rtsp_flush
        while _running:
            ok, frame = read_fresh_frame(cap, flush)
            if not ok or frame is None:
                fail += 1
                if fail > 30:
                    print("[stream] lost stream — reconnecting...")
                    break
                time.sleep(0.01)
                continue

            fail = 0
            frame = resize_max_width(frame, max_width)
            frame_i += 1

            fresh_events = False
            try:
                zcfg = current_zcfg(fallback_zcfg)
                if frame_i % infer_every_n == 0 or not draw_cache:
                    annotated, reports, draw_cache = annotate_frame(
                        frame, model, zcfg, tracker, conf, kpt_conf, imgsz
                    )
                    # Strip events from cache so non-infer frames never re-log
                    last_reports = [
                        {**r, "event": None, "is_alert": False} for r in reports
                    ]
                    fresh_events = True
                else:
                    annotated = redraw_cached(frame, zcfg, draw_cache, kpt_conf)
                    reports = last_reports
            except Exception as exc:
                print(f"[stream] annotate error: {exc}")
                annotated = redraw_cached(frame, current_zcfg(fallback_zcfg), [], kpt_conf)
                reports = []

            ok, buf = cv2.imencode(
                ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality]
            )
            if not ok:
                continue

            with _lock:
                _latest_jpeg = buf.tobytes()
                _latest_reports = reports

            if fresh_events:
                for r in reports:
                    if not r.get("event"):
                        continue
                    logged = push_event(
                        r["id"],
                        r["zone"],
                        r["event"],
                        bool(r.get("is_alert")),
                    )
                    if logged:
                        print(
                            f"  Person #{r['id']} | Zone: {ZONE_LABEL.get(r['zone'], r['zone'])} "
                            f"| Event: {r['event']}"
                        )

        cap.release()
        time.sleep(1)


def mjpeg_generator():
    while True:
        with _lock:
            frame = _latest_jpeg
        if frame is None:
            time.sleep(0.05)
            continue
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
        )
        time.sleep(0.03)


@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.get("/")
def index():
    return (
        "<h1>PoolsEye live stream</h1>"
        "<p>This is the video relay for the React dashboard (Live monitoring).</p>"
        '<p>Feed URL: <a href="/stream">/stream</a></p>'
        '<p>Status JSON: <a href="/events">/events</a></p>'
    )


@app.get("/stream")
def stream():
    return Response(
        mjpeg_generator(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/health")
def health():
    with _lock:
        ready = _latest_jpeg is not None
        n = len(_latest_reports)
        n_events = len(_event_log)
    return jsonify({
        "ok": True,
        "has_frame": ready,
        "people": n,
        "events": n_events,
        "source": _source_kind,
    })


@app.get("/events")
def events():
    """Event log (newest first) + current people snapshot for Live Monitoring."""
    with _lock:
        log = list(_event_log)
        reports = list(_latest_reports)
        has_frame = _latest_jpeg is not None
    return jsonify({
        "ok": True,
        "stream_online": has_frame,
        "events": log,
        "people": [
            {
                "id": r["id"],
                "zone": r["zone"],
                "zone_label": ZONE_LABEL.get(r["zone"], r["zone"]),
                "event": r.get("event"),
                "is_alert": bool(r.get("is_alert")),
                "foot": r.get("foot"),
                "foot_source": r.get("source"),
            }
            for r in reports
        ],
    })


if __name__ == "__main__":
    cfg = load_full_config(CONFIG_PATH)
    camera = load_camera_settings(cfg)
    print(f"[stream] config {CONFIG_PATH}")
    print(
        f"[stream] camera source={camera['source']} "
        f"fallback_webcam={camera['fallback_webcam']}"
    )

    t = threading.Thread(target=capture_loop, args=(cfg,), daemon=True)
    t.start()
    threading.Thread(target=geofence_poll_loop, args=(cfg["ZONES"],), daemon=True).start()
    print(f"[stream] watching geofence API {GEOFENCE_API}")

    app.run(host="0.0.0.0", port=8000, threaded=True, debug=False)
