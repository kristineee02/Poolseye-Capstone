"""
PoolsEye - live CCTV with zones + pose + alerts for the web dashboard.

Tapo RTSP → YOLO pose → nested Yellow⊃Red⊃Orange → annotated MJPEG
→ CameraPanel at http://localhost:8000/stream

Speed tips (POSE in config.json):
  imgsz, infer_every_n, max_width, jpeg_quality, rtsp_flush

Usage (from Capstone root):
    .venv\\Scripts\\python.exe scripts\\live_server.py
"""

from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

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

app = Flask(__name__)

_lock = threading.Lock()
_latest_jpeg: bytes | None = None
_latest_reports: list = []
_running = True


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


def capture_loop(rtsp_url: str, cfg: dict):
    global _latest_jpeg, _latest_reports, _running

    pose_cfg = cfg.get("POSE", {})
    track_cfg = cfg.get("TRACKING", {})
    zcfg = cfg["ZONES"]

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

    for warn in validate_nesting(zcfg):
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
        print("[stream] connecting to RTSP...")
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 10000)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 10000)
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

        if not cap.isOpened():
            print("[stream] open failed — check IP / RTSP / password. Retry in 5s...")
            time.sleep(5)
            continue

        print("[stream] connected — annotating frames for dashboard")
        fail = 0
        while _running:
            ok, frame = read_fresh_frame(cap, rtsp_flush)
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

            try:
                if frame_i % infer_every_n == 0 or not draw_cache:
                    annotated, reports, draw_cache = annotate_frame(
                        frame, model, zcfg, tracker, conf, kpt_conf, imgsz
                    )
                    last_reports = reports
                else:
                    annotated = redraw_cached(frame, zcfg, draw_cache, kpt_conf)
                    reports = last_reports
            except Exception as exc:
                print(f"[stream] annotate error: {exc}")
                annotated = redraw_cached(frame, zcfg, [], kpt_conf)
                reports = []

            ok, buf = cv2.imencode(
                ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality]
            )
            if not ok:
                continue

            with _lock:
                _latest_jpeg = buf.tobytes()
                _latest_reports = reports

            for r in reports:
                if r.get("event"):
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
    return jsonify({"ok": True, "has_frame": ready, "people": n})


@app.get("/events")
def events():
    with _lock:
        reports = list(_latest_reports)
    return jsonify({
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
        ]
    })


def load_rtsp_url(cfg: dict) -> str:
    url = cfg.get("CAMERA", {}).get("rtsp_url")
    if url:
        return url
    return "rtsp://PoolsEye:PoolsEyeCapstone@192.168.1.11:554/stream1"


if __name__ == "__main__":
    cfg = load_full_config(CONFIG_PATH)
    rtsp = load_rtsp_url(cfg)
    print(f"[stream] config {CONFIG_PATH}")
    print("[stream] RTSP host from config (password hidden)")

    t = threading.Thread(target=capture_loop, args=(rtsp, cfg), daemon=True)
    t.start()

    app.run(host="0.0.0.0", port=8000, threaded=True, debug=False)
