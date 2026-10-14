

from __future__ import annotations

import json
import math
import os
import sys
import tempfile
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

# TCP and no buffering for RTSP: fewer smeared frames, less delay
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay")

import cv2
import numpy as np
from flask import Flask, Response, jsonify, request
from ultralytics import YOLO

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from zone_check import (  # noqa: E402
    PersonTracker,
    ZONE_LABEL,
    SpatialCalibrator,
    classify_zone,
    draw_person,
    draw_skeleton,
    draw_supervision_overlay,
    foot_point,
    is_after_hours,
    load_full_config,
    looks_like_person,
    person_filter_from_config,
    process_result,
    supervision_label,
    validate_nesting,
    zone_pixels,
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
SITE_TIME_ZONE = os.environ.get("SITE_TIMEZONE", "Asia/Manila")
try:
    SITE_TZ = ZoneInfo(SITE_TIME_ZONE)
except ZoneInfoNotFoundError:
    # UTC+8, no DST; avoids needing tzdata on Windows
    SITE_TZ = timezone(timedelta(hours=8), name="UTC+08:00")

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
_instance_lock_handle = None
# Operating hours set from the dashboard Settings page (after-hours rule)
_hours_lock = threading.Lock()
_operating_hours: dict | None = None
_after_hours_active = False
# A new track id near a recently lost person inherits their history
_PERSON_MEMORY_SEC = 10.0
_REID_MAX_DIST_FRAC = 0.12  # of frame width
_person_alias: dict[int, int] = {}  # track id -> person id
_person_memory: dict[int, dict] = {}  # person id -> {"events": set, "foot": (x, y), "last_seen": t}
# An event type stays quiet until it has gone undetected this long
_event_quiet_sec = 120.0
_event_last_seen: dict[tuple, float] = {}  # (event name, from upload) -> last time it was detected
MAX_DISPLAY_DELAY_SEC = 2.5
ACTIVITY_SHOW_SEC = 1.5
ACTIVITY_POSE_SHOW_SEC = 0.5
STALE_RESULT_SEC = 3.0
# Seconds of feed saved before an alert
CLIP_SECONDS = 5.0
# Seconds of feed saved after an alert
CLIP_AFTER_SECONDS = 5.0
CLIP_MAX_WIDTH = 640  # VP8 encoding competes with inference for the CPU

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
        "title": "Yellow Zone Area",
        "severity": "LOW",
        "category": "yellow",
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
    # The backend pages lifeguards and sounds the ESP32 siren for this category
    "POSSIBLE_DROWNING": {
        "type": "alarm",
        "code": "DRN",
        "title": "Possible Drowning",
        "severity": "HIGH",
        "category": "drowning",
    },
}
# Person id used when the drowning model sees distress the pose model has no track for
UNTRACKED_PERSON_ID = 0


def sync_event_to_backend(entry: dict):
    """Persist live detection events to the Express backend for Event history."""
    payload = json.dumps(entry).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    secret = os.environ.get("EVENTS_INGEST_SECRET")
    if secret:
        headers["X-Events-Secret"] = secret
    reason = "no response"
    for attempt in range(4):
        try:
            req = Request(EVENTS_INGEST_API, data=payload, headers=headers, method="POST")
            with urlopen(req, timeout=15):
                return
        except HTTPError as err:
            if err.code < 500:
                print(f"[events] {entry['id']} rejected by {EVENTS_INGEST_API} ({err.code})")
                return
            reason = f"HTTP {err.code}"
        except (URLError, TimeoutError, OSError) as err:
            reason = str(getattr(err, "reason", err))
        time.sleep(2 * (attempt + 1))
    print(f"[events] could not save {entry['id']} to {EVENTS_INGEST_API} ({reason})")


def upload_event_media(event_id: str, content_type: str, data: bytes) -> str | None:
    """POST a snapshot or clip to the backend and return its /media path."""
    headers = {"Content-Type": content_type}
    secret = os.environ.get("EVENTS_INGEST_SECRET")
    if secret:
        headers["X-Events-Secret"] = secret
    url = f"{BACKEND_URL}/api/events/{event_id}/media"
    for _ in range(5):
        try:
            with urlopen(Request(url, data=data, headers=headers, method="POST"), timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8")).get("uri")
        except HTTPError as err:
            if err.code != 404:
                print(f"[media] upload for {event_id} rejected ({err.code})")
                return None
        except (URLError, TimeoutError, OSError, ValueError):
            pass
        time.sleep(1.5)
    print(f"[media] could not upload {content_type} for {event_id}")
    return None


def attach_event_media(event_id: str, field: str, uri: str | None):
    """Copy a saved media path onto the live event log so Live Monitoring can show it too."""
    if not uri:
        return
    with _lock:
        for entry in _event_log:
            if entry["id"] == event_id:
                entry[field] = uri
                break


def encode_clip(frames: list) -> bytes | None:
    """WebM (VP8) from buffered (seq, ts, jpeg) frames, timed to match how they were captured."""
    first = cv2.imdecode(np.frombuffer(frames[0][2], np.uint8), cv2.IMREAD_COLOR)
    if first is None:
        return None
    h, w = first.shape[:2]
    scale = min(1.0, CLIP_MAX_WIDTH / w)
    size = (int(w * scale) // 2 * 2, int(h * scale) // 2 * 2)
    span = frames[-1][1] - frames[0][1]
    fps = (len(frames) - 1) / span if span > 0 else 15.0
    fd, path = tempfile.mkstemp(suffix=".webm")
    os.close(fd)
    try:
        writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"VP80"), fps, size)
        if not writer.isOpened():
            return None
        for _, _, jpeg in frames:
            frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                continue
            if (frame.shape[1], frame.shape[0]) != size:
                frame = cv2.resize(frame, size, interpolation=cv2.INTER_AREA)
            writer.write(frame)
        writer.release()
        return Path(path).read_bytes()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


class AlertMediaRecorder:
    """Keeps the last few seconds of the annotated feed and saves evidence for each alert."""

    def __init__(self):
        self._frames: deque = deque()
        self._pending: list[dict] = []
        self._lock = threading.Lock()
        self._wake = threading.Event()
        threading.Thread(target=self._run, daemon=True).start()

    def add_frame(self, seq: int, ts: float, jpeg: bytes):
        keep = CLIP_SECONDS + CLIP_AFTER_SECONDS + MAX_DISPLAY_DELAY_SEC + 3.0
        with self._lock:
            self._frames.append((seq, ts, jpeg))
            while self._frames and ts - self._frames[0][1] > keep:
                self._frames.popleft()
            waiting = bool(self._pending)
        if waiting:
            self._wake.set()

    def clear(self):
        """Save evidence still owed to the previous source, then drop its frames so they never land in a new clip."""
        with self._lock:
            jobs, frames = self._pending, list(self._frames)
            self._pending = []
            self._frames.clear()
        for job in jobs:
            at = job.get("at") or self._alert_frame(job, frames)
            if at is None:
                continue
            if job.get("at") is None:
                self._spawn(self._save_snapshot, job, at)
            self._spawn(self._save_clip, job, self._clip_frames(at, frames))

    def request(self, event_id: str, seq: int, ts: float):
        now = time.time()
        with self._lock:
            self._pending.append({
                "id": event_id, "seq": seq, "ts": ts, "at": None,
                "deadline": now + MAX_DISPLAY_DELAY_SEC + 2.0,
                "clip_deadline": now + MAX_DISPLAY_DELAY_SEC + CLIP_AFTER_SECONDS + 4.0,
            })
        self._wake.set()

    @staticmethod
    def _alert_frame(job: dict, frames: list):
        return next((f for f in frames if f[0] >= job["seq"]), None) or (frames[-1] if frames else None)

    @staticmethod
    def _clip_frames(at, frames: list) -> list:
        return [f for f in frames if at[1] - CLIP_SECONDS <= f[1] <= at[1] + CLIP_AFTER_SECONDS]

    @staticmethod
    def _spawn(target, *args):
        threading.Thread(target=target, args=args, daemon=True).start()

    def _run(self):
        while True:
            self._wake.wait(1.0)
            self._wake.clear()
            now = time.time()
            snapshots, clips = [], []
            with self._lock:
                frames = list(self._frames)
                newest_seq = frames[-1][0] if frames else 0
                newest_ts = frames[-1][1] if frames else 0.0
                for job in list(self._pending):
                    if job["at"] is None and (newest_seq >= job["seq"] or now >= job["deadline"]):
                        job["at"] = self._alert_frame(job, frames)
                        if job["at"] is None:
                            self._pending.remove(job)
                            continue
                        snapshots.append((job, job["at"]))
                    if job["at"] is not None and (
                        newest_ts >= job["at"][1] + CLIP_AFTER_SECONDS or now >= job["clip_deadline"]
                    ):
                        self._pending.remove(job)
                        clips.append((job, self._clip_frames(job["at"], frames)))
            for job, at in snapshots:
                self._spawn(self._save_snapshot, job, at)
            for job, clip in clips:
                self._spawn(self._save_clip, job, clip)

    def _save_snapshot(self, job: dict, at):
        try:
            attach_event_media(job["id"], "snapshot_uri", upload_event_media(job["id"], "image/jpeg", at[2]))
        except Exception as exc:
            print(f"[media] could not save the snapshot for {job['id']}: {exc}")

    def _save_clip(self, job: dict, clip: list):
        if len(clip) < 2:
            print(f"[media] not enough frames to record a clip for {job['id']}")
            return
        try:
            data = encode_clip(clip)
            if not data:
                print(f"[media] could not encode the clip for {job['id']}")
                return
            uri = upload_event_media(job["id"], "video/webm", data)
            attach_event_media(job["id"], "clip_uri", uri)
            if uri:
                span = clip[-1][1] - clip[0][1]
                print(f"[media] saved {span:.1f}s clip for {job['id']} ({len(data) // 1024} KB)")
        except Exception as exc:
            print(f"[media] could not save the clip for {job['id']}: {exc}")


_media = AlertMediaRecorder()


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
    """Append a dashboard-ready event the first time this event type is detected."""
    pid = int(person_id)
    from_upload = _source_kind == "video"

    with _lock:
        key = (event_name, from_upload)
        detected_at = time.time()
        last = _event_last_seen.get(key)
        _event_last_seen[key] = detected_at
        if last is not None and detected_at - last < _event_quiet_sec:
            return None
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
    now = datetime.now(SITE_TZ)
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

    if supervision_data:
        entry.update(supervision_data)

    with _lock:
        _event_log.appendleft(entry)
    threading.Thread(target=sync_event_to_backend, args=(dict(entry),), daemon=True).start()
    return entry


def _box_iou(a, b) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def _box_overlap_of_smaller(a, b) -> float:
    """Share of the smaller box covered by the other; 1.0 when one sits inside the other."""
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return inter / smaller if smaller > 0 else 0.0


class DrowningWatcher:
    """Runs the drowning detector beside the pose tracker and flags sustained distress."""

    def __init__(self, model, cfg: dict):
        self.model = model
        self.conf = float(cfg.get("confidence_threshold", 0.5))
        self.imgsz = int(cfg.get("imgsz", 640))
        self.interval = 1.0 / max(0.2, float(cfg.get("max_infer_fps", 2)))
        self.hold_sec = float(cfg.get("hold_sec", 3.0))
        self.gap_sec = float(cfg.get("gap_sec", 1.5))
        self.rearm_sec = float(cfg.get("rearm_sec", 60.0))
        self.match_iou = float(cfg.get("match_iou", 0.2))
        wanted = {str(c).lower() for c in cfg.get("alert_classes", ["Drowning"])}
        self.class_ids = {int(i) for i, name in model.names.items() if str(name).lower() in wanted}
        self.show_all = bool(cfg.get("show_all_classes", True))
        self.display_conf = float(cfg.get("display_confidence", self.conf))
        self.pose_crop_conf = float(cfg.get("pose_crop_confidence", 0.1))
        self.max_pose_crops = max(1, int(cfg.get("max_pose_crops", 3)))
        self.pose_crop_imgsz = int(cfg.get("pose_crop_imgsz", 320))
        self.duplicate_overlap = float(cfg.get("duplicate_overlap", 0.6))
        # Bigger activity boxes (share of frame) are walls or water, not swimmers
        self.max_box_area = float(cfg.get("max_box_area", 0.35))
        # A drowning person stays upright in one place; a swimmer travels
        self.behavior = bool(cfg.get("behavior_enabled", True))
        self.behavior_hold = float(cfg.get("behavior_hold_sec", 4.0))
        self.behavior_travel = float(cfg.get("behavior_max_travel", 0.35))
        self.behavior_aspect = float(cfg.get("behavior_min_aspect", 0.9))
        self.behavior_min_samples = max(2, int(cfg.get("behavior_min_samples", 3)))
        self.water_classes = {str(c).lower() for c in cfg.get("water_classes", ["Swimming", "Drowning", "Floating"])}
        self.floating_from = {str(c).lower() for c in cfg.get("floating_from_classes", ["Normal"])}
        self.floating_aspect = float(cfg.get("floating_min_aspect", 1.4))
        self.floating_conf = float(cfg.get("floating_confidence", 0.05))
        self.latch_sec = float(cfg.get("drowning_latch_sec", 5.0))
        self._latches: list[dict] = []
        self.boxes: list[dict] = []
        self.labels: list[dict] = []
        self.poses: list[dict] = []
        self.boxes_at = 0.0
        self._streaks: dict[int, list[float]] = {}  # person id -> [first_seen, last_seen]
        self._fired: dict[int, float] = {}
        self._tracks: dict[int, dict] = {}  # water box track id -> {"box", "history", "seen"}
        self._next_track = 1
        self._last_run = 0.0
        self._cond = threading.Condition()
        self._pending = None
        self._events: list[dict] = []
        self._result: dict | None = None
        self._gen = 0
        self._thread = None

    def reset(self):
        with self._cond:
            self._gen += 1
            self._pending = None
            self._events.clear()
            self._result = None
            self.boxes, self.labels, self.poses, self.boxes_at = [], [], [], 0.0
            self._streaks.clear()
            self._fired.clear()
            self._tracks.clear()
            self._latches.clear()

    def start(self, pose_model, kpt_conf: float, person_filter: dict | None = None):
        self._pose_model, self._kpt_conf = pose_model, kpt_conf
        self._person_filter = {**person_filter, "min_confidence": self.pose_crop_conf} if person_filter else None
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def submit(self, frame, reports: list, zcfg: dict, people: list, seq: int, ts: float, use_zones: bool):
        """Hand the newest frame to the runner; an older frame still waiting is dropped."""
        with self._cond:
            self._pending = (frame, list(reports), zcfg, list(people), seq, ts, use_zones, self._gen)
            self._cond.notify()

    def drain_events(self) -> list[dict]:
        with self._cond:
            events, self._events = self._events, []
        return events

    def latest_result(self) -> dict | None:
        """Boxes and crop poses of the newest processed frame, tagged with that frame's seq/ts."""
        with self._cond:
            return self._result

    def _loop(self):
        while True:
            with self._cond:
                self._cond.wait_for(lambda: self._pending is not None)
            wait = self.interval - (time.time() - self._last_run)
            if wait > 0:
                time.sleep(wait)
            with self._cond:
                if self._pending is None:
                    continue
                frame, reports, zcfg, people, seq, ts, use_zones, gen = self._pending
                self._pending = None
            try:
                ran_at = self.boxes_at
                flagged = self.update(frame, reports, zcfg, time.time(), use_zones)
                if self.boxes_at == ran_at:
                    continue
                poses = []
                if self.boxes_at >= time.time() - 0.5:
                    poses = self.activity_poses(frame, self._pose_model, people, self._kpt_conf, self.pose_crop_imgsz)
            except Exception as exc:
                print(f"[stream] drowning model error: {exc}")
                continue
            with self._cond:
                if gen == self._gen:
                    self._events.extend({**hit, "seq": seq, "ts": ts} for hit in flagged)
                    self._result = {
                        "seq": seq, "ts": ts, "ready_at": time.time(),
                        "labels": list(self.labels), "poses": list(poses),
                    }

    def _owner(self, xyxy, reports) -> dict | None:
        best, best_iou = None, self.match_iou
        for r in reports:
            if r.get("xyxy") is None:
                continue
            iou = _box_iou(xyxy, [float(v) for v in r["xyxy"]])
            if iou >= best_iou:
                best, best_iou = r, iou
        return best

    def _still_in_water(self, water: list, zones_px, orange_px, use_zones: bool, now: float) -> list[dict]:
        """Water boxes that have stayed upright without travelling for behavior_hold seconds."""
        deep_on = use_zones and zones_px["orange"]["enabled"] and len(zones_px["orange"]["points"]) >= 2
        matched = set()
        for box in water:
            best, best_iou = None, 0.3
            for tid, tr in self._tracks.items():
                if tid in matched:
                    continue
                iou = _box_iou(box["xyxy"], tr["box"])
                if iou >= best_iou:
                    best, best_iou = tid, iou
            if best is None:
                best = self._next_track
                self._next_track += 1
                self._tracks[best] = {"history": deque(maxlen=64)}
            matched.add(best)
            x1, y1, x2, y2 = box["xyxy"]
            tr = self._tracks[best]
            tr.update(box=box["xyxy"], seen=now, last=box)
            tr["history"].append((now, (x1 + x2) / 2, (y1 + y2) / 2, max(1.0, x2 - x1), max(1.0, y2 - y1)))
        for tid in [t for t, tr in self._tracks.items() if now - tr["seen"] > self.gap_sec]:
            del self._tracks[tid]

        still = []
        for tid in matched:
            tr = self._tracks[tid]
            window = [h for h in tr["history"] if now - h[0] <= self.behavior_hold + self.gap_sec]
            if len(window) < self.behavior_min_samples or window[-1][0] - window[0][0] < self.behavior_hold:
                continue
            heights = sorted(h[4] for h in window)
            size = heights[len(heights) // 2]
            xs, ys = [h[1] for h in window], [h[2] for h in window]
            travel = math.hypot(max(xs) - min(xs), max(ys) - min(ys)) / size
            aspect = sorted(h[4] / h[3] for h in window)[len(window) // 2]
            if travel > self.behavior_travel or aspect < self.behavior_aspect:
                continue
            x1, y1, x2, y2 = tr["box"]
            if deep_on and classify_zone((x1 + x2) / 2, y2, zones_px, orange_px) != "orange":
                continue
            still.append(tr["last"])
        return still

    def _relabel_floating(self, detections: list, zones_px, orange_px, use_zones: bool):
        """Turn a person lying flat in the pool into Floating when the model called them Normal."""
        floats = [
            d for d in detections
            if d["name"].lower() == "floating" and d["conf"] >= self.floating_conf
        ]
        pool_drawn = use_zones and any(z["enabled"] and len(z["points"]) >= 3 for z in zones_px.values())
        for d in detections:
            if d["alert"] or d["name"].lower() not in self.floating_from:
                continue
            x1, y1, x2, y2 = d["xyxy"]
            if pool_drawn and classify_zone((x1 + x2) / 2, y2, zones_px, orange_px) == "clear":
                continue
            rival = any(_box_overlap_of_smaller(d["xyxy"], f["xyxy"]) >= 0.5 for f in floats)
            flat = (x2 - x1) >= self.floating_aspect * max(1.0, y2 - y1)
            if rival or flat:
                d["name"] = "Floating"

    def _latch_for(self, xyxy):
        # IoU so a small box beside the swimmer doesn't inherit the label
        best, best_iou = None, 0.3
        for latch in self._latches:
            iou = _box_iou(xyxy, latch["xyxy"])
            if iou >= best_iou:
                best, best_iou = latch, iou
        return best

    def _apply_drowning_latch(self, labels: list, boxes: list, now: float) -> tuple[list, list]:
        """Hold the Drowning label on a person for latch_sec after the last real Drowning call."""
        self._latches = [l for l in self._latches if now < l["until"]]
        for box in boxes:
            latch = self._latch_for(box["xyxy"])
            if latch is None:
                latch = {}
                self._latches.append(latch)
            latch.update(xyxy=box["xyxy"], until=now + self.latch_sec, conf=box["conf"], seen=now)

        held_labels = []
        for box in labels:
            latch = None if box["alert"] else self._latch_for(box["xyxy"])
            if latch is None:
                held_labels.append(box)
                continue
            held = {**box, "name": "Drowning", "alert": True, "latched": True, "conf": latch["conf"]}
            latch.update(xyxy=box["xyxy"], seen=now)
            held_labels.append(held)
            boxes.append(held)

        for latch in self._latches:
            if latch["seen"] == now or now - latch["seen"] > self.gap_sec:
                continue
            held = {"xyxy": latch["xyxy"], "conf": latch["conf"], "name": "Drowning", "alert": True, "latched": True}
            held_labels.append(held)
            boxes.append(held)
        return held_labels, boxes

    def update(self, frame, reports: list, zcfg: dict, now: float, use_zones: bool = True) -> list[dict]:
        """Return {id, zone, conf} for each person whose distress just outlasted hold_sec."""
        if now - self._last_run < self.interval:
            return []
        self._last_run = now

        min_conf = min(self.conf, self.display_conf) if self.show_all else self.conf
        result = self.model.predict(
            frame, conf=min(min_conf, self.floating_conf), imgsz=self.imgsz, verbose=False
        )[0]
        boxes, labels, water = [], [], []
        detections = []
        h, w = frame.shape[:2]
        zones_px = zone_pixels(zcfg, w, h)
        orange_px = zcfg.get("orange_proximity", 0.02) * w
        if result.boxes is not None and len(result.boxes):
            for xyxy, cls, c in zip(
                result.boxes.xyxy.cpu().numpy(),
                result.boxes.cls.cpu().numpy().astype(int),
                result.boxes.conf.cpu().numpy(),
            ):
                detections.append({
                    "xyxy": [float(v) for v in xyxy],
                    "conf": round(float(c), 2),
                    "name": str(self.model.names.get(int(cls), cls)),
                    "alert": int(cls) in self.class_ids and c >= self.conf,
                })
        max_area = self.max_box_area * w * h
        detections = [
            d for d in detections
            if (d["xyxy"][2] - d["xyxy"][0]) * (d["xyxy"][3] - d["xyxy"][1]) <= max_area
        ]
        self._relabel_floating(detections, zones_px, orange_px, use_zones)
        detections = [d for d in detections if d["conf"] >= min_conf]
        kept = []
        for box in sorted(detections, key=lambda b: (b["alert"], b["conf"]), reverse=True):
            if not any(_box_overlap_of_smaller(box["xyxy"], k["xyxy"]) >= self.duplicate_overlap for k in kept):
                kept.append(box)
        for box in kept:
            if box["name"].lower() in self.water_classes and box["conf"] >= self.display_conf:
                water.append(box)
            if box["alert"]:
                boxes.append(box)
                labels.append(box)
            elif self.show_all and box["conf"] >= self.display_conf:
                labels.append(box)

        if self.behavior:
            for box in self._still_in_water(water, zones_px, orange_px, use_zones, now):
                if box["alert"]:
                    box["behavior"] = True
                    continue
                flagged_box = {**box, "name": "Drowning", "alert": True, "behavior": True}
                labels = [flagged_box if b is box else b for b in labels]
                if flagged_box not in labels:
                    labels.append(flagged_box)
                boxes.append(flagged_box)
        labels, boxes = self._apply_drowning_latch(labels, boxes, now)
        self.boxes, self.labels, self.boxes_at = boxes, labels, now

        seen: dict[int, dict] = {}
        for box in boxes:
            owner = self._owner(box["xyxy"], reports)
            if owner is not None:
                pid, zone = int(owner["id"]), owner["zone"]
            else:
                x1, y1, x2, y2 = box["xyxy"]
                pid = UNTRACKED_PERSON_ID
                zone = classify_zone((x1 + x2) / 2, y2, zones_px, orange_px)
            if pid not in seen or box["conf"] > seen[pid]["conf"]:
                seen[pid] = {"id": pid, "zone": zone, "conf": box["conf"], "behavior": False, "latched": True}
            seen[pid]["behavior"] = seen[pid]["behavior"] or bool(box.get("behavior"))
            seen[pid]["latched"] = seen[pid]["latched"] and bool(box.get("latched"))

        for pid in [p for p, (_, last) in self._streaks.items() if now - last > self.gap_sec]:
            del self._streaks[pid]

        flagged = []
        for pid, hit in seen.items():
            latched = hit.pop("latched")
            if latched and pid not in self._streaks:
                continue
            streak = self._streaks.setdefault(pid, [now, now])
            streak[1] = now
            if now - streak[0] < self.hold_sec and not hit["behavior"]:
                continue
            if now - self._fired.get(pid, -1e9) < self.rearm_sec:
                continue
            self._fired[pid] = now
            flagged.append(hit)
        return flagged

    def activity_poses(self, frame, pose_model, existing_people: list, kpt_conf: float, imgsz: int) -> list:
        """Recover swimmer keypoints by enlarging activity-detector boxes."""
        if pose_model is None or not self.labels:
            self.poses = []
            return []
        h, w = frame.shape[:2]
        candidates = []
        for label in sorted(self.labels, key=lambda item: item["conf"], reverse=True):
            if any(_box_iou(label["xyxy"], person["xyxy"]) >= 0.2 for person in existing_people):
                continue
            x1, y1, x2, y2 = label["xyxy"]
            pad_x = max(30.0, (x2 - x1) * 0.35)
            pad_y = max(30.0, (y2 - y1) * 0.35)
            ax1, ay1 = max(0, int(x1 - pad_x)), max(0, int(y1 - pad_y))
            ax2, ay2 = min(w, int(x2 + pad_x)), min(h, int(y2 + pad_y))
            crop = frame[ay1:ay2, ax1:ax2]
            if crop.size:
                candidates.append((crop, ax1, ay1, label))
            if len(candidates) >= self.max_pose_crops:
                break
        if not candidates:
            self.poses = []
            return []

        results = pose_model.predict(
            [item[0] for item in candidates],
            conf=self.pose_crop_conf,
            imgsz=imgsz,
            verbose=False,
        )
        recovered = []
        for result, (_, ox, oy, label) in zip(results, candidates):
            if result.boxes is None or not len(result.boxes) or result.keypoints is None:
                continue
            xyxy = result.boxes.xyxy.cpu().numpy()
            confs = result.boxes.conf.cpu().numpy()
            kxy = result.keypoints.xy.cpu().numpy()
            kcf = result.keypoints.conf.cpu().numpy() if result.keypoints.conf is not None else None
            best = None
            for index, box in enumerate(xyxy):
                global_box = [box[0] + ox, box[1] + oy, box[2] + ox, box[3] + oy]
                score = _box_iou(global_box, label["xyxy"]) + float(confs[index]) * 0.1
                if best is None or score > best[0]:
                    best = (score, index)
            index = best[1]
            points = kxy[index].copy()
            points[:, 0] += ox
            points[:, 1] += oy
            point_conf = None if kcf is None else kcf[index]
            visible = len(points) if point_conf is None else int((point_conf >= kpt_conf).sum())
            box = xyxy[index]
            global_box = np.array([box[0] + ox, box[1] + oy, box[2] + ox, box[3] + oy])
            if visible >= 3 and looks_like_person(
                float(confs[index]), point_conf, self._person_filter, global_box, points
            ):
                recovered.append({"kxy": points, "kcf": point_conf})
        self.poses = recovered
        return recovered


ACTIVITY_COLORS = {
    "drowning": (0, 0, 255),
    "floating": (0, 140, 255),
    "swimming": (255, 160, 30),
    "normal": (80, 175, 40),
}


def _draw_activity_label(frame, box: dict, x1: int, y1: int, y2: int, below_offset: int = 0):
    alert = bool(box.get("alert", True))
    name = str(box.get("name") or "Drowning")
    color = ACTIVITY_COLORS.get(name.lower(), (160, 160, 160))
    label = f"{name.upper() if alert else name} {box['conf']:.2f}"
    scale = 0.6 if alert else 0.5
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, 2)
    if alert:
        ty = max(th + 6, y1)
    else:
        ty = min(frame.shape[0] - 2, y2 + below_offset + th + 6)
    cv2.rectangle(frame, (x1, ty - th - 6), (x1 + tw + 6, ty), color, -1)
    cv2.putText(frame, label, (x1 + 3, ty - 4), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), 2)


def draw_drowning_boxes(frame, boxes: list):
    for box in sorted(boxes, key=lambda b: bool(b.get("alert", True))):
        alert = bool(box.get("alert", True))
        color = ACTIVITY_COLORS.get(str(box.get("name") or "Drowning").lower(), (160, 160, 160))
        x1, y1, x2, y2 = (int(v) for v in box["xyxy"])
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3 if alert else 2)
        _draw_activity_label(frame, box, x1, y1, y2)


def match_activity_to_people(people: list, boxes: list) -> tuple[dict, list]:
    """Pair each tracked person with the activity box covering them; return (index -> box, unmatched)."""
    matched, claimed = {}, set()
    pxs = [[float(v) for v in person["xyxy"]] for person in people]
    pairs = [
        (bool(box.get("alert", True)), _box_iou(px, box["xyxy"]), i, index)
        for i, box in enumerate(boxes)
        for index, px in enumerate(pxs)
        if _box_overlap_of_smaller(px, box["xyxy"]) >= 0.3
    ]
    for _, _, i, index in sorted(pairs, reverse=True):
        if i in claimed or index in matched:
            continue
        claimed.add(i)
        matched[index] = boxes[i]
    unmatched = [
        box for i, box in enumerate(boxes)
        if i not in claimed and not any(_box_overlap_of_smaller(px, box["xyxy"]) >= 0.3 for px in pxs)
    ]
    return matched, unmatched


def _keypoint_box(kxy, kcf, kpt_conf):
    if kxy is None:
        return None
    pts = np.asarray(kxy, float)
    ok = (pts[:, 0] > 1) & (pts[:, 1] > 1)
    if kcf is not None:
        ok &= np.asarray(kcf) >= kpt_conf
    if not ok.any():
        return None
    pts = pts[ok]
    return [pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max()]


def resize_max_width(frame, max_width: int):
    if max_width <= 0:
        return frame
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / w
    return cv2.resize(frame, (max_width, int(h * scale)), interpolation=cv2.INTER_AREA)


class FrameGrabber:
    """Reads a capture on its own thread and keeps a short history of recent frames."""

    def __init__(self, cap, kind: str, max_width: int, publish_fps: float, source_path: Path | None = None):
        self.cap = cap
        self.kind = kind
        self.source_path = source_path
        self.max_width = max_width
        self.failed = False


        self.ended = False
        self.loops = 0
        self._frame = None
        self._ts = 0.0
        self._seq = 0
        self._history: deque = deque(maxlen=max(10, int(publish_fps * (MAX_DISPLAY_DELAY_SEC + 1))))
        self._publish_interval = 1.0 / publish_fps
        self._last_publish = 0.0
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
                delay = next_frame_at - time.time()
                if delay > 0:
                    time.sleep(delay)
                next_frame_at = max(next_frame_at + self._frame_interval, time.time() - self._frame_interval)
            ok, frame = self.cap.read()
            if (not ok or frame is None) and self.kind == "video":

                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, frame = self.cap.read()
                if not ok or frame is None:
                    with self._cond:
                        self.ended = True
                        self._cond.notify_all()
                    return
                with self._cond:
                    self.loops += 1
                next_frame_at = time.time() + self._frame_interval

                # Loop the upload instead of falling back to the live camera
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, frame = self.cap.read()
                if (not ok or frame is None) and self.source_path:
                    self.cap.release()
                    self.cap = cv2.VideoCapture(str(self.source_path))
                    ok, frame = self.cap.read()
                if ok and frame is not None:
                    with self._cond:
                        self.loops += 1
                    next_frame_at = time.time() + self._frame_interval
                else:
                    with self._cond:
                        self.failed = True
                        self._cond.notify_all()
                    return

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
            now = time.time()
            if now - self._last_publish < self._publish_interval * 0.9:
                continue
            self._last_publish = now
            frame = resize_max_width(frame, self.max_width)
            with self._cond:
                self._seq += 1
                self._frame = frame
                self._ts = now
                self._history.append((self._seq, now, frame))
                self._cond.notify_all()

    def latest(self, after_seq: int, timeout: float = 1.0):
        """Newest (seq, capture time, frame) above after_seq, or (after_seq, 0.0, None) on timeout."""
        with self._cond:
            self._cond.wait_for(lambda: self._seq > after_seq or self.failed or self.ended or self._stop, timeout)
            if self._seq > after_seq:
                return self._seq, self._ts, self._frame
            return after_seq, 0.0, None

    @property
    def newest_seq(self) -> int:
        with self._cond:
            return self._seq

    def frames_between(self, after_seq: int, upto_seq: int) -> list:
        """Buffered (seq, capture time, frame) with after_seq < seq <= upto_seq, oldest first."""
        with self._cond:
            return [item for item in self._history if after_seq < item[0] <= upto_seq]

    def stop(self):
        with self._cond:
            self._stop = True
            self._cond.notify_all()
        self._thread.join(timeout=2)
        self.cap.release()


def annotate_frame(frame, model, zcfg, tracker, conf, kpt_conf, imgsz: int,
                   supervision_cfg: dict | None = None,
                   calibrator: SpatialCalibrator | None = None,
                   after_hours: bool = False,
                   person_filter: dict | None = None,
                   tracker_cfg: str = "botsort.yaml"):
    """Run pose track + supervision; return reports, the scene to draw, and supervision events."""
    results = model.track(
        source=frame,
        conf=conf,
        iou=float((person_filter or {}).get("nms_iou", 0.7)),
        imgsz=imgsz,
        tracker=tracker_cfg,
        persist=True,
        verbose=False,
        stream=False,
    )
    if not results:
        return [], {"people": [], "overlay": None}, []

    _, reports = process_result(
        results[0], zcfg, tracker, kpt_conf, persist=True,
        draw_zone_overlay=False, draw_people=False, person_filter=person_filter,
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
                        'supervised': (labels[p['id']] or {}).get('supervised', True),
                    },
                }
                for p in people
            ],
            "calibrator": calibrator,
            "threshold": float(supervision_cfg.get('threshold_meters', 0.7)),
        }

    draw_cache = []
    for r in reports:
        fx, fy, src, left, right = foot_point(r["xyxy"], r["kxy"], r["kcf"], kpt_conf)
        draw_cache.append({
            "track_id": r["id"],
            "xyxy": r["xyxy"],
            "foot": (fx, fy),
            "src": src,
            "left": left,
            "right": right,
            "kxy": r["kxy"],
            "kcf": r["kcf"],
            "zone": r["zone"],
            "event": r.get("event"),
            "supervision": labels.get(r["id"]),
        })

    for r in reports:
        label = labels.get(r["id"])
        r["supervision_status"] = label["status"] if label else None

    return reports, {"people": draw_cache, "overlay": overlay}, supervision_events


def _lerp_point(p, q, t: float):
    if p is None or q is None:
        return p if t < 0.5 else q
    return tuple(float(a) + (float(b) - float(a)) * t for a, b in zip(p, q))


def _same_body(a, b) -> bool:
    """Whether two boxes with the same track ID can be one person moving between inferences."""
    a, b = [float(v) for v in a], [float(v) for v in b]
    size = max(1.0, min(a[2] - a[0], b[2] - b[0], a[3] - a[1], b[3] - b[1]))
    ca = ((a[0] + a[2]) / 2, (a[1] + a[3]) / 2)
    cb = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    return math.hypot(ca[0] - cb[0], ca[1] - cb[1]) <= size


def _blend_person(a: dict, b: dict, t: float, near: dict) -> dict:
    out = {
        **near,
        "xyxy": np.asarray(a["xyxy"], float) + (np.asarray(b["xyxy"], float) - np.asarray(a["xyxy"], float)) * t,
        "foot": _lerp_point(a["foot"], b["foot"], t),
        "left": _lerp_point(a["left"], b["left"], t),
        "right": _lerp_point(a["right"], b["right"], t),
    }
    if a["kxy"] is not None and b["kxy"] is not None:
        ka, kb = np.asarray(a["kxy"], float), np.asarray(b["kxy"], float)
        out["kxy"] = ka + (kb - ka) * t
        if a["kcf"] is not None and b["kcf"] is not None:
            # Missing joints sit at (0, 0); don't blend them
            out["kcf"] = np.minimum(a["kcf"], b["kcf"])
    return out


def attach_activity(results, result: dict | None, epoch: int):
    """Store a drowning-model result on the scene of the frame it was computed from."""
    if not result:
        return
    for scene in reversed(results):
        if scene.get("activity_seq") == result["seq"]:
            return
        if scene["seq"] == result["seq"] and scene.get("epoch") == epoch:
            scene.update(
                drowning=result["labels"], activity_poses=result["poses"],
                activity_seq=result["seq"], activity_ready_at=result["ready_at"],
            )
            return


def _activity_for(results: list, seq: int, ts: float) -> tuple[list, list]:
    """Drowning boxes and crop poses from the newest activity frame at or before `seq`."""
    done = [r for r in results if r.get("activity_seq") is not None and r["seq"] <= seq]
    if not done:
        return [], []
    src = done[-1]
    if ts - src["ts"] > ACTIVITY_SHOW_SEC:
        return [], []
    labels = src.get("drowning") or []
    poses = (src.get("activity_poses") or []) if ts - src["ts"] <= ACTIVITY_POSE_SHOW_SEC else []
    return labels, poses


def scene_at(results: list, seq: int, ts: float) -> dict:
    """Detections for a displayed frame, interpolated between the inferences on either side of it."""
    labels, poses = _activity_for(results, seq, ts)
    scene = _pose_scene_at(results, seq, ts)
    people = scene["people"]
    if scene.get("video") and labels:
        # Drop video poses no activity box confirms (curtains, furniture)
        people = [p for p in people if any(_box_iou(p["xyxy"], b["xyxy"]) >= 0.1 for b in labels)]
    return {**scene, "people": people, "drowning": labels, "activity_poses": poses}


def _pose_scene_at(results: list, seq: int, ts: float) -> dict:
    before = [r for r in results if r["seq"] <= seq]
    after = [r for r in results if r["seq"] >= seq]
    a = before[-1] if before else after[0]
    b = after[0] if after else a
    if a is b or b["ts"] <= a["ts"]:
        return a
    t = min(1.0, max(0.0, (ts - a["ts"]) / (b["ts"] - a["ts"])))
    if a.get("epoch") != b.get("epoch"):
        # Track ids restart when a video loops
        return a if t < 0.5 else b
    near, far = (a, b) if t < 0.5 else (b, a)
    far_people = {p["track_id"]: p for p in far["people"]}
    people = []
    for person in near["people"]:
        other = far_people.get(person["track_id"])
        if other is None or not _same_body(person["xyxy"], other["xyxy"]):
            people.append(person)
        else:
            pa, pb = (person, other) if near is a else (other, person)
            people.append(_blend_person(pa, pb, t, person))

    overlay = near.get("overlay")
    if overlay:
        feet = {p["track_id"]: p["foot"] for p in people}
        overlay = {**overlay, "people": [{**p, "foot": feet.get(p["id"], p["foot"])} for p in overlay["people"]]}
    return {"people": people, "overlay": overlay, "video": near.get("video", False)}


def render_scene(frame, scene: dict, kpt_conf):
    """Paint the latest inference result (proximity lines, then people) onto a camera frame."""
    out = frame.copy()
    overlay = scene.get("overlay")
    if overlay:
        try:
            draw_supervision_overlay(out, overlay["people"], overlay["calibrator"], overlay["threshold"])
        except Exception:
            pass
    people = scene.get("people", [])
    activity, unmatched = match_activity_to_people(people, scene.get("drowning") or [])
    for index, item in enumerate(people):
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
            activity=activity.get(index),
        )
    person_boxes = [[float(v) for v in item["xyxy"]] for item in people]
    crop_boxes = []
    for pose in scene.get("activity_poses", []):
        kbox = _keypoint_box(pose["kxy"], pose["kcf"], kpt_conf)
        if kbox is None:
            continue
        crop_boxes.append(kbox)
        if any(_box_overlap_of_smaller(kbox, px) >= 0.3 for px in person_boxes):
            continue
        person_boxes.append(kbox)
        draw_skeleton(out, pose["kxy"], pose["kcf"], kpt_conf)
    unmatched = [
        box for box in unmatched
        if box.get("alert", True) or any(_box_overlap_of_smaller(kb, box["xyxy"]) >= 0.5 for kb in crop_boxes)
    ]
    draw_drowning_boxes(out, unmatched)
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
    with _lock:
        for key in [k for k in _event_last_seen if k[1]]:
            del _event_last_seen[key]
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
    global _latest_jpeg, _latest_reports, _running, _zcfg, _source_kind, _active_camera_host, _event_quiet_sec

    pose_cfg = cfg.get("POSE", {})
    track_cfg = cfg.get("TRACKING", {})
    _event_quiet_sec = float(track_cfg.get("event_quiet_sec", _event_quiet_sec))
    fallback_zcfg = cfg["ZONES"]
    camera = load_camera_settings(cfg)
    with _zcfg_lock:
        if _zcfg is None:
            _zcfg = fallback_zcfg

    model_name = pose_cfg.get("model") or "yolo11n-pose.pt"
    pose_path = Path(model_name)
    if not pose_path.is_absolute():
        pose_path = SCRIPTS_DIR / pose_path
    conf = float(pose_cfg.get("confidence_threshold", 0.25))
    kpt_conf = float(pose_cfg.get("keypoint_confidence", 0.3))
    person_filter = person_filter_from_config(pose_cfg)
    tracker_path = SCRIPTS_DIR / str(pose_cfg.get("tracker") or "tracker.yaml")
    tracker_cfg = str(tracker_path) if tracker_path.exists() else "botsort.yaml"
    print(f"[stream] tracker: {tracker_cfg}")
    imgsz = int(pose_cfg.get("imgsz", 416))
    max_width = int(pose_cfg.get("max_width", 960))
    jpeg_quality = int(pose_cfg.get("jpeg_quality", 65))
    stream_fps = max(1.0, float(pose_cfg.get("stream_fps", 15)))
    max_infer_fps = max(0.5, float(pose_cfg.get("max_infer_fps", 6)))

    if not pose_path.exists():
        raise FileNotFoundError(f"Pose model not found: {pose_path}")
    print(f"[stream] loading pose model {pose_path}")
    model = YOLO(str(pose_path))
    kpt_shape = getattr(model.model, "kpt_shape", None)
    if model.task != "pose" or not kpt_shape:
        raise RuntimeError(
            f"POSE.model must be a YOLO pose/keypoint checkpoint; {pose_path.name} reports task={model.task!r}"
        )
    print(f"[stream] pose: keypoints={kpt_shape[0]} conf={conf:g} kpt_conf={kpt_conf:g}")

    drowning = None
    activity_pose_model = None
    drown_cfg = cfg.get("DROWNING", {})
    if drown_cfg.get("enabled", True):
        drown_path = Path(drown_cfg.get("model") or "drowning_best.pt")
        if not drown_path.is_absolute():
            drown_path = SCRIPTS_DIR / drown_path
        if drown_path.exists():
            print(f"[stream] loading drowning model {drown_path.name}")
            drowning_model = YOLO(str(drown_path))
            if drowning_model.task != "detect":
                raise RuntimeError(
                    f"DROWNING.model must be a YOLO detection checkpoint; "
                    f"{drown_path.name} reports task={drowning_model.task!r}"
                )
            drowning = DrowningWatcher(drowning_model, drown_cfg)
            if drown_cfg.get("pose_crop_fallback", True):
                activity_pose_model = YOLO(str(pose_path))
            drowning.start(activity_pose_model, kpt_conf, person_filter)
            print(
                f"[stream] drowning: classes={sorted(drowning.class_ids)} conf={drowning.conf:g} "
                f"hold={drowning.hold_sec:g}s fps={1 / drowning.interval:g} "
                f"labels={'all classes' if drowning.show_all else 'alerts only'} (>= {drowning.display_conf:g}) "
                f"behavior={'on' if drowning.behavior else 'off'} "
                f"(still {drowning.behavior_hold:g}s, travel <= {drowning.behavior_travel:g})"
            )
        else:
            print(f"[stream] WARN drowning model {drown_path} not found — drowning alerts are off")
    sup_cfg_init = cfg.get("SUPERVISION", {})
    tracker = PersonTracker(
        cooldown_sec=float(track_cfg.get("alert_cooldown_sec", 3.0)),
        lost_sec=float(track_cfg.get("lost_track_sec", 2.0)),
        supervision_cooldown_sec=float(sup_cfg_init.get("alert_cooldown_sec", 10.0)),
    )

    calibrator_box: dict = {"key": None, "calibrator": None}

    for warn in validate_nesting(current_zcfg(fallback_zcfg)):
        print(f"[stream] WARN {warn}")

    print(
        f"[stream] speed: imgsz={imgsz} max_infer_fps={max_infer_fps:g} stream_fps={stream_fps:g} "
        f"max_width={max_width} jpeg={jpeg_quality}"
    )
    print("[stream] nested Yellow ⊃ Red ⊃ Orange | pose + crossing alerts")

    def ensure_calibrator(frame, zcfg, supervision_cfg):
        fh, fw = frame.shape[:2]
        key = json.dumps([
            fw, fh, zcfg.get("coord_space"), zcfg.get("editor_size"),
            (zcfg.get("red") or {}).get("points"), (zcfg.get("yellow") or {}).get("points"),
        ], default=str)
        if calibrator_box["key"] == key:
            return calibrator_box["calibrator"]
        try:
            calibrator = SpatialCalibrator.from_config({**cfg, "ZONES": zcfg}, fw, fh)
            print(f"[stream] SpatialCalibrator initialized ({fw}x{fh}) — 0.7m proximity using perspective projection")
        except Exception as cal_err:
            print(f"[stream] Calibrator init warning: {cal_err} — falling back to linear scale")
            calibrator = SpatialCalibrator(
                pool_width_m=float(supervision_cfg.get('pool_real_width_meters', 15.0)),
                pool_length_m=float(supervision_cfg.get('pool_real_length_meters', 25.0)),
                frame_size=(fw, fh),
            )
        calibrator_box.update(key=key, calibrator=calibrator)
        return calibrator

    def reset_tracking():
        """Forget every track so a new source (or a video replay) raises its own alerts."""
        tracker.states.clear()
        for yolo_tracker in getattr(getattr(model, "predictor", None), "trackers", None) or []:
            yolo_tracker.reset()
        reset_people()
        if drowning:
            drowning.reset()

    def log_events(supervision_events, reports, seq: int, ts: float, drowning_events=()):
        def logged(entry):
            if entry and entry["is_alert"]:
                _media.request(entry["id"], seq, ts)
            return entry

        conf_by_id = {r["id"]: r.get("conf") for r in reports}
        for sev in supervision_events:
            supervision_data = dict(sev.get('supervision_data') or {})
            nearest = supervision_data.get('nearest_person_id')
            supervision_data['confidence'] = conf_by_id.get(sev['id'])
            supervision_data['nearest_confidence'] = conf_by_id.get(nearest) if nearest is not None else None
            if nearest is not None:
                with _lock:
                    supervision_data['nearest_person_id'] = _person_alias.get(nearest, nearest)
            if logged(push_event(sev['id'], sev['zone'], sev['event'], bool(sev['is_alert']), supervision_data)):
                sep = supervision_data.get('separation_distance')
                thr = supervision_data.get('supervision_threshold', 0.7)
                sep_str = f"{sep:.2f}m" if sep is not None else "N/A"
                print(
                    f"  [{sev['event']}] Person #{sev['id']} "
                    f"| Zone: {sev['zone']} | Dist: {sep_str} vs {thr}m threshold"
                )
        for r in reports:
            if r.get("event") and logged(push_event(r["id"], r["zone"], r["event"], bool(r.get("is_alert")))):
                print(
                    f"  Person #{r['id']} | Zone: {ZONE_LABEL.get(r['zone'], r['zone'])} "
                    f"| Event: {r['event']}"
                )
        for d in drowning_events:
            if logged(push_event(d["id"], d["zone"], "POSSIBLE_DROWNING", True, {"confidence": d["conf"]})):
                print(
                    f"  [POSSIBLE_DROWNING] Person #{d['id']} "
                    f"| Zone: {ZONE_LABEL.get(d['zone'], d['zone'])} | conf {d['conf']:.2f}"
                )

    def inference_worker(grabber: FrameGrabber, results: deque, scene_lock: threading.Lock,
                         stop: threading.Event):
        global _latest_reports
        seq = 0
        loops = grabber.loops
        min_interval = 1.0 / max_infer_fps
        stats_at, runs, busy = time.time(), 0, 0.0
        while not stop.is_set():
            seq, ts, frame = grabber.latest(seq, timeout=0.5)
            if frame is None:
                if grabber.ended:
                    stop.wait(0.1)
                continue
            if grabber.loops != loops:
                loops = grabber.loops
                reset_tracking()
                print("[stream] uploaded video restarted — boxes only, alerts were logged on the first play")
            started = time.time()
            try:
                zcfg = current_zcfg(fallback_zcfg)
                supervision_cfg = cfg.get("SUPERVISION", {})
                reports, scene, supervision_events = annotate_frame(
                    frame, model, zcfg, tracker, conf, kpt_conf, imgsz,
                    supervision_cfg=supervision_cfg,
                    calibrator=ensure_calibrator(frame, zcfg, supervision_cfg),
                    after_hours=grabber.kind != "video" and after_hours_now(),
                    person_filter=person_filter,
                    tracker_cfg=tracker_cfg,
                )
                sync_people(reports, frame.shape[1], time.time())
                drowning_events = []
                if drowning:
                    drowning.submit(
                        frame, reports, zcfg, scene["people"], seq, ts,
                        # Zones are drawn for the CCTV view, not for uploaded footage
                        use_zones=grabber.kind != "video",
                    )
                    drowning_events = drowning.drain_events()
                scene.update(seq=seq, ts=ts, ready_at=time.time(), epoch=loops, video=grabber.kind == "video")
                with scene_lock:
                    results.append(scene)
                    if drowning:
                        attach_activity(results, drowning.latest_result(), loops)
                with _lock:
                    _latest_reports = [{**r, "event": None, "is_alert": False} for r in reports]
                if loops == 0:
                    log_events(supervision_events, reports, seq, ts)
                    for d in drowning_events:
                        log_events([], [], d["seq"], d["ts"], [d])
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

        reset_tracking()
        _media.clear()
        print(f"[stream] connected ({kind}) — annotating frames for dashboard")
        grabber = FrameGrabber(
            cap,
            kind,
            max_width,
            stream_fps,
            source_path=video["path"] if video else None,
        )
        results: deque = deque(maxlen=8)
        scene_lock = threading.Lock()
        stop_inference = threading.Event()
        worker = threading.Thread(
            target=inference_worker, args=(grabber, results, scene_lock, stop_inference), daemon=True,
        )
        worker.start()

        def publish_frame(frame, scene, seq: int, ts: float):
            annotated = render_scene(frame, scene, kpt_conf) if scene else frame
            ok, buf = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality])
            if ok:
                jpeg = buf.tobytes()
                publish_jpeg(jpeg)
                _media.add_frame(seq, ts, jpeg)

        shown_seq = 0
        publish_interval = 1.0 / stream_fps
        delay = 0.5
        newest_result_seq = 0
        connected_at = delay_logged_at = time.time()
        while _running:
            if _camera_changed.is_set():
                with _lock:
                    _latest_jpeg = None
                break
            if grabber.failed:
                if kind == "video":
                    print("[stream] uploaded video decoder stopped — reopening the same video...")
                else:
                    print("[stream] lost stream — reconnecting...")
                break
            if grabber.ended:
                ended_at = ended_at or time.time()
                if shown_seq >= grabber.newest_seq or time.time() - ended_at > MAX_DISPLAY_DELAY_SEC + 1.0:
                    print("[stream] uploaded video could not be replayed — returning to live CCTV")
                    with _lock:
                        _latest_jpeg = None
                    clear_video()
                    break

            with scene_lock:
                snapshot = list(results)
            now = time.time()
            if not snapshot and now - connected_at < STALE_RESULT_SEC:
                time.sleep(0.01)
                continue
            if not snapshot or now - snapshot[-1]["ready_at"] > STALE_RESULT_SEC:
                seq, ts, frame = grabber.latest(shown_seq, timeout=0.2)
                if frame is not None:
                    shown_seq = seq
                    publish_frame(frame, None, seq, ts)
                elif grabber.ended:
                    time.sleep(0.02)
                continue

            if len(snapshot) >= 2 and snapshot[-1]["seq"] != newest_result_seq:
                newest_result_seq = snapshot[-1]["seq"]
                needed = snapshot[-1]["ready_at"] - snapshot[-2]["ts"] + publish_interval
                delay = min(MAX_DISPLAY_DELAY_SEC, max(needed, 0.95 * delay + 0.05 * needed))
                activity = [r for r in snapshot if r.get("activity_ready_at")]
                if activity:
                    activity_needed = activity[-1]["activity_ready_at"] - activity[-1]["ts"] + publish_interval
                    delay = min(MAX_DISPLAY_DELAY_SEC, max(delay, activity_needed))
                if now - delay_logged_at >= 30:
                    print(f"[stream] feed shown {delay * 1000:.0f} ms behind capture so boxes match each frame")
                    delay_logged_at = now

            pending = grabber.frames_between(shown_seq, snapshot[-1]["seq"])
            while len(pending) > 1 and pending[0][1] + delay < now - publish_interval:
                pending.pop(0)
            if not pending:
                time.sleep(0.01)
                continue
            seq, ts, frame = pending[0]
            wait = ts + delay - now
            if wait > 0:
                time.sleep(min(wait, 0.02))
                continue
            shown_seq = seq
            publish_frame(frame, scene_at(snapshot, seq, ts), seq, ts)

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


def acquire_instance_lock() -> bool:
    """Prevent two inference servers from competing for port 8000 and the same camera."""
    global _instance_lock_handle
    lock_path = Path(tempfile.gettempdir()) / "poolseye-live-server.lock"
    handle = open(lock_path, "a+b")
    try:
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (OSError, IOError):
        handle.close()
        return False
    _instance_lock_handle = handle
    return True


if __name__ == "__main__":
    if not acquire_instance_lock():
        sys.exit("[stream] another live_server.py instance is already running")
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
