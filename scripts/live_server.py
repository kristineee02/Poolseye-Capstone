

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
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

# Read by OpenCV's FFmpeg backend when an RTSP stream is opened: TCP avoids smeared frames
# from dropped UDP packets, nobuffer/low_delay stop FFmpeg queueing seconds of video.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay")

import cv2
from flask import Flask, Response, jsonify, request
from ultralytics import YOLO

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from zone_check import (  # noqa: E402
    PersonTracker,
    ZONE_LABEL,
    SpatialCalibrator,
    draw_person,
    draw_supervision_overlay,
    foot_point,
    is_after_hours,
    load_full_config,
    people_from_result,
    process_result,
    supervision_label,
    validate_nesting,
)
CONFIG_PATH = SCRIPTS_DIR / "config.json"
# Must be the same backend the dashboard uses (frontend VITE_API_URL), or settings saved there never arrive.
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:4000").rstrip("/")
GEOFENCE_API = os.environ.get("GEOFENCE_API", f"{BACKEND_URL}/api/geofence/live")
EVENTS_INGEST_API = os.environ.get("EVENTS_INGEST_API", f"{BACKEND_URL}/api/events/ingest")
CAMERA_SETTINGS_API = os.environ.get("CAMERA_SETTINGS_API", f"{BACKEND_URL}/api/camera-settings")
ADMIN_VERIFY_API = os.environ.get("ADMIN_VERIFY_API", f"{BACKEND_URL}/api/auth/me")
OPERATING_HOURS_API = os.environ.get("OPERATING_HOURS_API", f"{BACKEND_URL}/api/operating-hours")
OPERATING_HOURS_POLL_SEC = 15
UPLOAD_DIR = SCRIPTS_DIR / "uploads"
VIDEO_EXTS_ALLOWED = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "500"))
UPLOAD_CAMERA_ID = "UPLOAD"
DEFAULT_RTSP = "rtsp://PoolsEye:PoolsEyeCapstone@192.168.0.130:554/stream1"

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

_lock = threading.Lock()
_zcfg_lock = threading.Lock()
_latest_jpeg: bytes | None = None
_latest_reports: list = []
_event_log: deque = deque(maxlen=100)
_running = True
_zcfg: dict | None = None
_source_kind = "rtsp"
# Camera IP/port set from the dashboard Settings page; overrides the host in rtsp_url.
_camera_lock = threading.Lock()
_camera_override: dict | None = None
_camera_changed = threading.Event()
_active_camera_host: str | None = None
# Uploaded video that replaces the CCTV feed until the admin returns to live
_video_lock = threading.Lock()
_video_override: dict | None = None  # {"path": Path, "name": str}
# Operating hours set from the dashboard Settings page (after-hours rule)
_hours_lock = threading.Lock()
_operating_hours: dict | None = None
_after_hours_active = False
# Each event type is logged once per person for as long as that person stays in view.
# YOLO often hands the same person a new track id after a brief occlusion, so a new id that
# appears where a recently lost person stood inherits that person's history.
_PERSON_MEMORY_SEC = 10.0
_REID_MAX_DIST_FRAC = 0.12  # of frame width
_person_alias: dict[int, int] = {}  # track id -> person id
_person_memory: dict[int, dict] = {}  # person id -> {"events": set, "foot": (x, y), "last_seen": t}

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
    "UNSUPERVISED": {
        "type": "alarm",
        "code": "SUP",
        "title": "Unsupervised Person",
        "severity": "HIGH",
        "category": "supervision",
    },
    "SUPERVISED": {
        "type": "safe",
        "code": "SUP",
        "title": "Person Supervised",
        "severity": "LOW",
        "category": "supervision",
    },
    "AFTER_HOURS_PRESENCE": {
        "type": "alarm",
        "code": "AHR",
        "title": "After-Hours Presence",
        "severity": "HIGH",
        "category": "supervision",
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


def sync_people(reports: list, frame_width: int, now: float):
    """Map this frame's track ids to persistent people and forget anyone gone too long."""
    max_dist = _REID_MAX_DIST_FRAC * max(1, frame_width)
    with _lock:
        gone = {p for p, mem in _person_memory.items() if now - mem["last_seen"] > _PERSON_MEMORY_SEC}
        for p in gone:
            del _person_memory[p]
        for pid in [t for t, p in _person_alias.items() if p in gone]:
            del _person_alias[pid]

        present = [(int(r["id"]), r.get("foot")) for r in reports]
        claimed = {_person_alias[pid] for pid, _ in present if pid in _person_alias}
        for pid, foot in present:
            if pid not in _person_alias:
                best = None
                if foot is not None:
                    for person, mem in _person_memory.items():
                        if person in claimed or mem["foot"] is None:
                            continue
                        d = ((foot[0] - mem["foot"][0]) ** 2 + (foot[1] - mem["foot"][1]) ** 2) ** 0.5
                        if d <= max_dist and (best is None or d < best[0]):
                            best = (d, person)
                person = best[1] if best else pid
                _person_alias[pid] = person
                claimed.add(person)
            mem = _person_memory.setdefault(_person_alias[pid], {"events": set(), "foot": None, "last_seen": now})
            if foot is not None:
                mem["foot"] = foot
            mem["last_seen"] = now


def reset_people():
    with _lock:
        _person_alias.clear()
        _person_memory.clear()


def push_event(person_id: int, zone: str, event_name: str, is_alert: bool, supervision_data: dict = None):
    """Append a dashboard-ready event the first time this person triggers this event type."""
    pid = int(person_id)

    with _lock:
        person = _person_alias.setdefault(pid, pid)
        mem = _person_memory.setdefault(person, {"events": set(), "foot": None, "last_seen": time.time()})
        if event_name in mem["events"]:
            return None
        mem["events"].add(event_name)
    person_id = person

    meta = EVENT_CATALOG.get(event_name, {
        "type": "warn" if is_alert else "info",
        "code": "EVT",
        "title": event_name,
        "severity": "MEDIUM" if is_alert else "LOW",
        "category": "zone",
    })
    now = datetime.now()
    from_upload = _source_kind == "video"
    camera_id = UPLOAD_CAMERA_ID if from_upload else "CAM-01"
    source_label = "Uploaded video" if from_upload else "CAM-01"
    entry = {
        "id": f"evt-{uuid.uuid4().hex[:10]}",
        "type": meta["type"],
        "code": meta["code"],
        "title": meta["title"],
        "meta": f"{ZONE_LABEL.get(zone, zone)} · Person #{person_id} · {source_label}",
        "time": now.strftime("%I:%M:%S %p").lstrip("0"),
        "date": "Today",
        "status": "pending" if is_alert else "resolved",
        "severity": meta["severity"],
        "category": meta["category"],
        "camera": camera_id,
        "person_id": person_id,
        "zone": zone,
        "zone_label": ZONE_LABEL.get(zone, zone),
        "event": event_name,
        "is_alert": bool(is_alert),
        "ts": now.timestamp(),
    }

    # Add supervision-specific data if provided
    if supervision_data:
        entry.update(supervision_data)

    with _lock:
        _event_log.appendleft(entry)
    threading.Thread(target=sync_event_to_backend, args=(dict(entry),), daemon=True).start()
    return entry


def resize_max_width(frame, max_width: int):
    if max_width <= 0:
        return frame
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / w
    return cv2.resize(frame, (max_width, int(h * scale)), interpolation=cv2.INTER_AREA)


class FrameGrabber:
    """Reads a capture on its own thread and keeps only the newest frame.

    Inference is far slower than the camera on a CPU, so reading frames in the
    same loop lets FFmpeg's buffer grow and the dashboard drifts seconds behind.
    """

    def __init__(self, cap, kind: str, max_width: int):
        self.cap = cap
        self.kind = kind
        self.max_width = max_width
        self.failed = False
        self._frame = None
        self._seq = 0
        self._cond = threading.Condition()
        self._stop = False
        fps = cap.get(cv2.CAP_PROP_FPS) if kind == "video" else 0
        self._frame_interval = 1.0 / fps if fps and fps > 0 else (1.0 / 25 if kind == "video" else 0)
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        fail = 0
        next_frame_at = time.time()
        while not self._stop:
            if self._frame_interval:
                # Files decode faster than real time; pace playback to the video's own FPS.
                delay = next_frame_at - time.time()
                if delay > 0:
                    time.sleep(delay)
                next_frame_at = max(next_frame_at + self._frame_interval, time.time() - self._frame_interval)
            ok, frame = self.cap.read()
            if (not ok or frame is None) and self.kind == "video":
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, frame = self.cap.read()
            if not ok or frame is None:
                fail += 1
                if fail > 30:
                    with self._cond:
                        self.failed = True
                        self._cond.notify_all()
                    return
                time.sleep(0.01)
                continue
            fail = 0
            frame = resize_max_width(frame, self.max_width)
            with self._cond:
                self._frame = frame
                self._seq += 1
                self._cond.notify_all()

    def latest(self, after_seq: int, timeout: float = 1.0):
        """Newest frame with a sequence number above after_seq, or (after_seq, None) on timeout."""
        with self._cond:
            self._cond.wait_for(lambda: self._seq > after_seq or self.failed or self._stop, timeout)
            if self._seq > after_seq:
                return self._seq, self._frame
            return after_seq, None

    def stop(self):
        with self._cond:
            self._stop = True
            self._cond.notify_all()
        self._thread.join(timeout=2)
        self.cap.release()


def annotate_frame(frame, model, zcfg, tracker, conf, kpt_conf, imgsz: int,
                   supervision_cfg: dict | None = None,
                   calibrator: SpatialCalibrator | None = None,
                   after_hours: bool = False):
    """Run pose track + supervision; return reports, the scene to draw, and supervision events.

    Drawing is left to render_scene so the display loop can paint the latest
    people onto every new camera frame while the next inference runs. After
    hours, everyone in view is flagged without the proximity check.

    Zone boundaries are not burned into the frame — the dashboard draws them
    as a toggleable SVG overlay from the Geofence Editor layout.
    """
    results = model.track(
        source=frame,
        conf=conf,
        imgsz=imgsz,
        persist=True,
        verbose=False,
        stream=False,
    )
    if not results:
        return [], {"people": [], "overlay": None}, []

    _, reports = process_result(
        results[0], zcfg, tracker, kpt_conf, persist=True,
        draw_zone_overlay=False, draw_people=False,
    )

    sup_enabled = bool(supervision_cfg and supervision_cfg.get('enabled', False))
    people = [
        {'id': r['id'], 'foot': r['foot'], 'zone': r['zone'], 'xyxy': r.get('xyxy')}
        for r in reports if r.get('foot')
    ]
    supervision_events = []
    if (sup_enabled or after_hours) and people:
        supervision_events = tracker.update_supervision(
            people, supervision_cfg or {}, calibrator, time.time(), after_hours=after_hours,
        )
    labels = {p['id']: supervision_label(p, tracker, sup_enabled or after_hours) for p in people}

    overlay = None
    if sup_enabled and not after_hours and people:
        overlay = {
            "people": [
                {
                    **p,
                    'supervision_data': {
                        **(p.get('supervision_data') or {}),
                        'supervised': labels[p['id']]['supervised'],
                    },
                }
                for p in people
            ],
            "calibrator": calibrator,
            "threshold": float(supervision_cfg.get('threshold_meters', 0.7)),
        }

    draw_cache = []
    for track_id, xyxy, kxy, kcf in people_from_result(results[0]):
        fx, fy, src, left, right = foot_point(xyxy, kxy, kcf, kpt_conf)
        zone = next((r["zone"] for r in reports if r["id"] == track_id), "clear")
        event = next((r.get("event") for r in reports if r["id"] == track_id), None)
        item = {
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
            "supervision": labels.get(track_id),
        }
        draw_cache.append(item)

    for r in reports:
        label = labels.get(r["id"])
        r["supervision_status"] = label["status"] if label else None

    return reports, {"people": draw_cache, "overlay": overlay}, supervision_events


def render_scene(frame, scene: dict, kpt_conf):
    """Paint the latest inference result (proximity lines, then people) onto a camera frame."""
    out = frame.copy()
    overlay = scene.get("overlay")
    if overlay:
        try:
            draw_supervision_overlay(out, overlay["people"], overlay["calibrator"], overlay["threshold"])
        except Exception:
            pass
    for item in scene.get("people", []):
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
            supervision_data=item.get("supervision"),
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


def apply_rtsp_host(rtsp_url: str, host: str, port: int | None) -> str:
    """Swap the host/port in an RTSP URL, keeping credentials and stream path."""
    parts = urlsplit(rtsp_url)
    userinfo = ""
    if "@" in parts.netloc:
        userinfo = parts.netloc.rsplit("@", 1)[0] + "@"
    netloc = f"{userinfo}{host}:{port}" if port else f"{userinfo}{host}"
    return urlunsplit((parts.scheme or "rtsp", netloc, parts.path, parts.query, parts.fragment))


def effective_camera(camera: dict) -> dict:
    with _camera_lock:
        override = dict(_camera_override) if _camera_override else None
    if not override:
        return camera
    return {
        **camera,
        "rtsp_url": apply_rtsp_host(camera["rtsp_url"], override["ip"], override.get("port")),
    }


def rtsp_host_label(rtsp_url: str) -> str:
    parts = urlsplit(rtsp_url)
    return f"{parts.hostname or ''}:{parts.port or 554}"


_camera_fetch_warned = False


def fetch_camera_settings() -> tuple[str, int | None] | None:
    global _camera_fetch_warned
    try:
        with urlopen(CAMERA_SETTINGS_API, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError) as exc:
        if not _camera_fetch_warned:
            print(f"[stream] cannot read camera settings from {CAMERA_SETTINGS_API} ({exc}) — using the last known camera IP")
            _camera_fetch_warned = True
        return None
    _camera_fetch_warned = False
    ip = str(data.get("ipAddress") or "").strip()
    if not ip:
        return None
    port = data.get("rtspPort")
    return ip, (int(port) if port else None)


def set_camera_override(settings: tuple[str, int | None]):
    global _camera_override
    ip, port = settings
    with _camera_lock:
        _camera_override = {"ip": ip, "port": port}


def camera_poll_loop(initial: tuple[str, int | None] | None):
    """Pull the CCTV IP/port saved in dashboard Settings and trigger a reconnect on change."""
    last = initial
    while _running:
        time.sleep(3)
        settings = fetch_camera_settings()
        if settings is None or settings == last:
            continue
        set_camera_override(settings)
        last = settings
        print(f"[stream] camera IP changed to {settings[0]}:{settings[1]} from dashboard — reconnecting")
        _camera_changed.set()


def fetch_operating_hours() -> dict | None:
    try:
        with urlopen(OPERATING_HOURS_API, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data.get("schedule"), dict) else None


def operating_hours_poll_loop():
    """Pull the schedule saved in dashboard Settings. Keeps the last good copy if the backend is down."""
    global _operating_hours
    last_revision = None
    while _running:
        hours = fetch_operating_hours()
        if hours is not None:
            with _hours_lock:
                _operating_hours = hours
            if hours.get("revision") != last_revision:
                state = "on" if hours.get("enabled") else "off"
                print(f"[stream] operating hours rev={hours.get('revision')} synced ({hours.get('timezone')}, after-hours rule {state})")
                last_revision = hours.get("revision")
        time.sleep(OPERATING_HOURS_POLL_SEC)


def after_hours_now() -> bool:
    global _after_hours_active
    with _hours_lock:
        hours = dict(_operating_hours) if _operating_hours else None
    active = is_after_hours(hours)
    if active != _after_hours_active:
        _after_hours_active = active
        print(f"[stream] {'AFTER HOURS — everyone in view is flagged unsupervised' if active else 'operating hours — proximity rule active'}")
    return active


def current_video() -> dict | None:
    with _video_lock:
        return dict(_video_override) if _video_override else None


def _remove_upload(path: Path | None):
    if not path:
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def set_video(path: Path, name: str):
    global _video_override
    with _video_lock:
        previous = _video_override["path"] if _video_override else None
        _video_override = {"path": path, "name": name}
    _camera_changed.set()
    if previous and previous != path:
        # Let the capture loop release the old file before deleting it
        threading.Timer(3.0, _remove_upload, args=(previous,)).start()


def clear_video():
    global _video_override
    with _video_lock:
        previous = _video_override["path"] if _video_override else None
        _video_override = None
    _camera_changed.set()
    if previous:
        threading.Timer(3.0, _remove_upload, args=(previous,)).start()


def verify_admin(auth_header: str) -> tuple[bool, str]:
    """Confirm the dashboard token belongs to an admin by asking the backend."""
    if not auth_header.startswith("Bearer "):
        return False, "Sign in as an admin to upload videos."
    try:
        req = Request(ADMIN_VERIFY_API, headers={"Authorization": auth_header})
        with urlopen(req, timeout=5) as resp:
            return resp.status == 200, ""
    except HTTPError as err:
        if err.code in (401, 403):
            return False, "Admin access only."
        return False, f"Could not verify admin session ({err.code})."
    except (URLError, TimeoutError, OSError):
        return False, "Could not reach the backend to verify your admin session."


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

    print(f"[stream] connecting to RTSP at {rtsp_host_label(settings['rtsp_url'])}...")
    # Same open path as test_tapo.py (default backend, not CAP_FFMPEG).
    cap = cv2.VideoCapture(settings["rtsp_url"])
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return cap


def capture_loop(cfg: dict):
    global _latest_jpeg, _latest_reports, _running, _zcfg, _source_kind, _active_camera_host

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
    max_width = int(pose_cfg.get("max_width", 960))
    jpeg_quality = int(pose_cfg.get("jpeg_quality", 65))
    stream_fps = max(1.0, float(pose_cfg.get("stream_fps", 15)))
    # Leaves CPU for decoding and encoding; uncapped inference starves them and video stutters.
    max_infer_fps = max(0.5, float(pose_cfg.get("max_infer_fps", 6)))

    print(f"[stream] loading pose model {model_name}")
    model = YOLO(model_name)

    sup_cfg_init = cfg.get("SUPERVISION", {})
    tracker = PersonTracker(
        cooldown_sec=float(track_cfg.get("alert_cooldown_sec", 3.0)),
        lost_sec=float(track_cfg.get("lost_track_sec", 2.0)),
        supervision_cooldown_sec=float(sup_cfg_init.get("alert_cooldown_sec", 10.0)),
    )

    # Calibrator is built lazily from the first frame's dimensions
    calibrator_box: list[SpatialCalibrator | None] = [None]

    for warn in validate_nesting(current_zcfg(fallback_zcfg)):
        print(f"[stream] WARN {warn}")

    print(
        f"[stream] speed: imgsz={imgsz} max_infer_fps={max_infer_fps:g} stream_fps={stream_fps:g} "
        f"max_width={max_width} jpeg={jpeg_quality}"
    )
    print("[stream] nested Yellow ⊃ Red ⊃ Orange | pose + crossing alerts")

    def ensure_calibrator(frame, zcfg, supervision_cfg):
        if calibrator_box[0] is not None:
            return calibrator_box[0]
        fh, fw = frame.shape[:2]
        try:
            calibrator_box[0] = SpatialCalibrator.from_config({**cfg, "ZONES": zcfg}, fw, fh)
            print(f"[stream] SpatialCalibrator initialized ({fw}x{fh}) — 0.7m proximity using perspective projection")
        except Exception as cal_err:
            print(f"[stream] Calibrator init warning: {cal_err} — falling back to linear scale")
            calibrator_box[0] = SpatialCalibrator(
                pool_width_m=float(supervision_cfg.get('pool_real_width_meters', 15.0)),
                pool_length_m=float(supervision_cfg.get('pool_real_length_meters', 25.0)),
                frame_size=(fw, fh),
            )
        return calibrator_box[0]

    def log_events(supervision_events, reports):
        conf_by_id = {r["id"]: r.get("conf") for r in reports}
        for sev in supervision_events:
            supervision_data = dict(sev.get('supervision_data') or {})
            nearest = supervision_data.get('nearest_person_id')
            supervision_data['confidence'] = conf_by_id.get(sev['id'])
            supervision_data['nearest_confidence'] = conf_by_id.get(nearest) if nearest is not None else None
            if nearest is not None:
                with _lock:
                    supervision_data['nearest_person_id'] = _person_alias.get(nearest, nearest)
            if push_event(sev['id'], sev['zone'], sev['event'], bool(sev['is_alert']), supervision_data):
                sep = supervision_data.get('separation_distance')
                thr = supervision_data.get('supervision_threshold', 0.7)
                sep_str = f"{sep:.2f}m" if sep is not None else "N/A"
                print(
                    f"  [{sev['event']}] Person #{sev['id']} "
                    f"| Zone: {sev['zone']} | Dist: {sep_str} vs {thr}m threshold"
                )
        for r in reports:
            if r.get("event") and push_event(r["id"], r["zone"], r["event"], bool(r.get("is_alert"))):
                print(
                    f"  Person #{r['id']} | Zone: {ZONE_LABEL.get(r['zone'], r['zone'])} "
                    f"| Event: {r['event']}"
                )

    def inference_worker(grabber: FrameGrabber, scene_box: dict, scene_lock: threading.Lock,
                         stop: threading.Event):
        global _latest_reports
        seq = 0
        min_interval = 1.0 / max_infer_fps
        stats_at, runs, busy = time.time(), 0, 0.0
        while not stop.is_set():
            seq, frame = grabber.latest(seq, timeout=0.5)
            if frame is None:
                continue
            started = time.time()
            try:
                zcfg = current_zcfg(fallback_zcfg)
                supervision_cfg = cfg.get("SUPERVISION", {})
                reports, scene, supervision_events = annotate_frame(
                    frame, model, zcfg, tracker, conf, kpt_conf, imgsz,
                    supervision_cfg=supervision_cfg,
                    calibrator=ensure_calibrator(frame, zcfg, supervision_cfg),
                    after_hours=after_hours_now(),
                )
                sync_people(reports, frame.shape[1], time.time())
                with scene_lock:
                    scene_box["scene"] = scene
                with _lock:
                    _latest_reports = [{**r, "event": None, "is_alert": False} for r in reports]
                log_events(supervision_events, reports)
            except Exception as exc:
                print(f"[stream] annotate error: {exc}")
            elapsed = time.time() - started
            runs, busy = runs + 1, busy + elapsed
            if time.time() - stats_at >= 30:
                print(f"[stream] inference {busy / runs * 1000:.0f} ms avg, {runs / (time.time() - stats_at):.1f}/s")
                stats_at, runs, busy = time.time(), 0, 0.0
            stop.wait(max(0.0, min_interval - elapsed))

    while _running:
        _camera_changed.clear()
        active = effective_camera(camera)
        video = current_video()
        if video:
            kind = "video"
            _source_kind = kind
            _active_camera_host = None
            print(f"[stream] playing uploaded video {video['name']}")
            cap = cv2.VideoCapture(str(video["path"]))
            if not cap.isOpened():
                print("[stream] uploaded video could not be opened — returning to live CCTV")
                cap.release()
                clear_video()
                continue
        else:
            kind = resolve_capture_kind(active)
            _source_kind = kind
            _active_camera_host = rtsp_host_label(active["rtsp_url"]) if kind == "rtsp" else None
            cap = open_capture(kind, active)

        if not cap.isOpened() and kind == "rtsp" and active["fallback_webcam"]:
            print("[stream] RTSP open failed — falling back to laptop webcam")
            cap.release()
            kind = "webcam"
            _source_kind = kind
            _active_camera_host = None
            cap = open_capture(kind, active)

        if not cap.isOpened():
            if kind == "webcam":
                print("[stream] webcam open failed — check that a camera is connected. Retry in 5s...")
            else:
                print("[stream] open failed — check IP / RTSP / password. Retry in 5s...")
            _camera_changed.wait(5)
            continue

        reset_people()
        print(f"[stream] connected ({kind}) — annotating frames for dashboard")
        grabber = FrameGrabber(cap, kind, max_width)
        scene_box = {"scene": {"people": [], "overlay": None}}
        scene_lock = threading.Lock()
        stop_inference = threading.Event()
        worker = threading.Thread(
            target=inference_worker, args=(grabber, scene_box, scene_lock, stop_inference), daemon=True,
        )
        worker.start()

        seq = 0
        publish_interval = 1.0 / stream_fps
        next_publish = 0.0
        while _running:
            if _camera_changed.is_set():
                with _lock:
                    _latest_jpeg = None
                break
            if grabber.failed:
                print("[stream] lost stream — reconnecting...")
                break
            seq, frame = grabber.latest(seq, timeout=1.0)
            if frame is None:
                continue
            now = time.time()
            if now < next_publish:
                continue
            next_publish = max(next_publish + publish_interval, now - publish_interval)

            with scene_lock:
                scene = scene_box["scene"]
            annotated = render_scene(frame, scene, kpt_conf)
            ok, buf = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality])
            if ok:
                publish_jpeg(buf.tobytes())

        stop_inference.set()
        worker.join(timeout=5)
        grabber.stop()
        time.sleep(1)


_jpeg_cond = threading.Condition()
_jpeg_seq = 0


def publish_jpeg(data: bytes):
    global _latest_jpeg, _jpeg_seq
    with _lock:
        _latest_jpeg = data
    with _jpeg_cond:
        _jpeg_seq += 1
        _jpeg_cond.notify_all()


def mjpeg_generator():
    """Send each new frame once; resending stale frames only adds network and browser lag."""
    sent = 0
    while True:
        with _jpeg_cond:
            _jpeg_cond.wait_for(lambda: _jpeg_seq != sent, timeout=1.0)
            current = _jpeg_seq
        with _lock:
            frame = _latest_jpeg
        if frame is None or current == sent:
            continue
        sent = current
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
        )


@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return resp


@app.errorhandler(413)
def upload_too_large(_err):
    return jsonify({"ok": False, "error": f"Video is larger than {MAX_UPLOAD_MB} MB."}), 413


@app.post("/upload")
def upload_video():
    allowed, reason = verify_admin(request.headers.get("Authorization", ""))
    if not allowed:
        return jsonify({"ok": False, "error": reason}), 401

    file = request.files.get("video")
    if file is None or not file.filename:
        return jsonify({"ok": False, "error": "Choose a video file to upload."}), 400
    ext = Path(file.filename).suffix.lower()
    if ext not in VIDEO_EXTS_ALLOWED:
        allowed_list = ", ".join(sorted(e.lstrip(".") for e in VIDEO_EXTS_ALLOWED))
        return jsonify({"ok": False, "error": f"Unsupported video type. Use: {allowed_list}."}), 400

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    file.save(dest)

    probe = cv2.VideoCapture(str(dest))
    readable = probe.isOpened() and probe.read()[0]
    probe.release()
    if not readable:
        _remove_upload(dest)
        return jsonify({"ok": False, "error": "That file could not be read as a video."}), 400

    name = Path(file.filename).name[:120]
    set_video(dest, name)
    print(f"[stream] admin uploaded video {name} — switching feed")
    return jsonify({"ok": True, "source": "video", "video_name": name})


@app.post("/source/live")
def return_to_live():
    allowed, reason = verify_admin(request.headers.get("Authorization", ""))
    if not allowed:
        return jsonify({"ok": False, "error": reason}), 401
    if current_video():
        clear_video()
        print("[stream] admin returned feed to live CCTV")
    return jsonify({"ok": True, "source": "live"})


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
        "camera_host": _active_camera_host,
        "video_name": (current_video() or {}).get("name"),
        "after_hours": _after_hours_active,
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
                "supervision": r.get("supervision_status"),
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

    if UPLOAD_DIR.exists():
        for leftover in UPLOAD_DIR.iterdir():
            if leftover.is_file():
                _remove_upload(leftover)

    print(f"[stream] backend {BACKEND_URL} (set BACKEND_URL to match the dashboard's VITE_API_URL)")
    initial_camera = fetch_camera_settings()
    if initial_camera:
        set_camera_override(initial_camera)
        print(f"[stream] camera IP {initial_camera[0]}:{initial_camera[1]} loaded from dashboard")
    else:
        print(f"[stream] dashboard camera settings unavailable — using rtsp_url from {CONFIG_PATH.name}")
    threading.Thread(target=camera_poll_loop, args=(initial_camera,), daemon=True).start()
    threading.Thread(target=operating_hours_poll_loop, daemon=True).start()

    t = threading.Thread(target=capture_loop, args=(cfg,), daemon=True)
    t.start()
    threading.Thread(target=geofence_poll_loop, args=(cfg["ZONES"],), daemon=True).start()
    print(f"[stream] watching geofence API {GEOFENCE_API}")

    app.run(host="0.0.0.0", port=8000, threaded=True, debug=False)
