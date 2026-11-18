"""
PoolsEye - live CCTV → YOLO pose → pool-zone intrusion.

Pipeline
--------
Tapo C320WS → RTSP → YOLO pose (default yolo11n-pose.pt) → person + 17
keypoints → ankle/foot point → ByteTrack ID → zone classification →
crossing events (with cooldown).

Zones (red and orange are independent areas inside yellow):
  yellow  outer safety     OUTSIDE→YELLOW  start monitoring (not an alert)
  red     warning boundary YELLOW→RED      RED BOUNDARY CROSSED
  orange  deep pool        YELLOW→ORANGE   DEEP POOL ENTRY

Drowning logic lives in pose_logic.py and is not run here. Both can later
share the same person IDs and keypoints.

This script does NOT use dataset/person_pose/. Fine-tune later with
train_person_pose.py if pool ankles are unreliable, then pass
--model path/to/best.pt.

Usage
-----
    python scripts/zone_check.py --source tapo_still.jpg
    python scripts/zone_check.py --source rtsp
    python scripts/zone_check.py --source rtsp://USER:PASS@IP:554/stream1
    python scripts/zone_check.py --self-test
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import cv2
import numpy as np
from ultralytics import YOLO

try:
    from calibration import SpatialCalibrator
except ImportError:
    from scripts.calibration import SpatialCalibrator

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = Path(__file__).resolve().parent / "config.json"
OUT_DIR = REPO_ROOT / "runs" / "pose" / "zone_check"

IMG_EXTS = {
    ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp",
    ".mpo", ".dng", ".jp2", ".heic", ".heif", ".avif",
}
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".wmv", ".m4v"}

LEFT_ANKLE, RIGHT_ANKLE = 15, 16
SKELETON = [
    (0, 1), (0, 2), (1, 3), (2, 4),
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
    (5, 11), (6, 12), (11, 12),
    (11, 13), (13, 15), (12, 14), (14, 16),
]

# BGR — matches frontend/src/data/geofence.js
COLORS = {
    "yellow": (0, 184, 230),
    "red": (74, 54, 214),
    "orange": (34, 126, 230),
    "foot": (255, 255, 255),
    "clear": (80, 200, 80),
    "ankle_l": (255, 180, 0),
    "ankle_r": (255, 0, 255),
    "bone": (180, 220, 255),
    "supervised": (110, 156, 27),   # Safe green #1B9C6E in BGR
    "unsupervised": (74, 54, 214),  # Alert red #D6364A in BGR
}

# Supervision status → (tag text, BGR color) for the per-person label
SUPERVISION_TAGS = {
    "supervised": ("SUPERVISED", COLORS["supervised"]),
    "unsupervised": ("UNSUPERVISED", COLORS["unsupervised"]),
    # After-hours remains a distinct internal event, but the clean camera UI
    # presents the same safety state as every other unsupervised person.
    "after_hours": ("UNSUPERVISED", COLORS["unsupervised"]),
    # Outside the yellow check zone: no supervision tag (draw_person skips missing tags).
}

ACTIVITY_TAG_COLORS = {
    "normal": (80, 175, 40),
    "swimming": (255, 160, 30),
    "floating": (0, 140, 255),
    "drowning": (0, 0, 255),
}

ZONE_LABEL = {
    "clear": "OUTSIDE",
    "yellow": "YELLOW",
    "red": "RED",
    "orange": "ORANGE",
    "supervision": "SUPERVISION",
}

BOX_COLOR = {
    "orange": "orange",
    "red": "red",
    "yellow": "yellow",
    "clear": "clear",
}

# (from, to) → (hud text, counts as alert); leaving a zone is not logged
CROSSING_EVENTS = {
    ("clear", "yellow"): ("ENTERED POOL AREA", False),
    ("clear", "red"): ("RED BOUNDARY CROSSED", True),
    ("clear", "orange"): ("DEEP POOL ENTRY", True),
    ("yellow", "red"): ("RED BOUNDARY CROSSED", True),
    ("yellow", "orange"): ("DEEP POOL ENTRY", True),
    ("red", "orange"): ("DEEP POOL ENTRY", True),
}


def load_full_config(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"[error] config not found: {path}")
    with path.open(encoding="utf-8") as f:
        cfg = json.load(f)
    if "ZONES" not in cfg:
        sys.exit(f"[error] no ZONES block in {path}")
    return cfg


def to_pixel_points(points, frame_w, frame_h, coord_space, editor_size):
    out = []
    ew, eh = editor_size
    for x, y in points:
        x, y = float(x), float(y)
        if coord_space == "normalized":
            px, py = x * frame_w, y * frame_h
        elif coord_space == "editor":
            px, py = (x / ew) * frame_w, (y / eh) * frame_h
        elif coord_space == "pixel":
            px, py = x, y
        else:
            sys.exit(f"[error] unknown coord_space '{coord_space}' (use normalized, editor, or pixel)")
        out.append((px, py))
    return out


def point_in_polygon(x, y, polygon) -> bool:
    n = len(polygon)
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        intersects = ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def dist_point_to_segment(px, py, ax, ay, bx, by) -> float:
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    ab2 = abx * abx + aby * aby
    if ab2 == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, (apx * abx + apy * aby) / ab2))
    return math.hypot(px - (ax + t * abx), py - (ay + t * aby))


def dist_to_polyline(x, y, polyline) -> float:
    if len(polyline) < 2:
        return math.inf
    best = math.inf
    for i in range(len(polyline) - 1):
        ax, ay = polyline[i]
        bx, by = polyline[i + 1]
        best = min(best, dist_point_to_segment(x, y, ax, ay, bx, by))
    return best


def calculate_pixel_to_meter_ratio(frame_width, pool_real_width_m):
    """Calculate pixels per meter ratio for distance conversion (legacy 1D fallback)."""
    return frame_width / pool_real_width_m


def pixels_to_meters(pixel_distance, frame_width, pool_real_width_m):
    """Convert pixel distance to meters (legacy 1D fallback)."""
    ratio = calculate_pixel_to_meter_ratio(frame_width, pool_real_width_m)
    return pixel_distance / ratio


def _body_height_meters(p1, p2) -> float | None:
    """Estimate distance from body extent when surveyed calibration is unavailable.

    A swimmer can be horizontal, so using box height alone makes the apparent
    scale too small and incorrectly labels nearby swimmers as unsupervised.
    The longest box dimension works for both upright and horizontal people.
    """
    try:
        fx1, fy1 = p1["foot"]
        fx2, fy2 = p2["foot"]
        boxes = []
        for person in (p1, p2):
            xyxy = person.get("xyxy")
            if xyxy is None or len(xyxy) < 4:
                continue
            width = float(xyxy[2]) - float(xyxy[0])
            height = float(xyxy[3]) - float(xyxy[1])
            extent = max(width, height)
            if extent > 1.0:
                boxes.append(extent)
        if not boxes:
            return None
        # Typical visible head-to-foot body extent is approximately 1.7 m.
        px_per_m = (sum(boxes) / len(boxes)) / 1.7
        if px_per_m <= 1e-6:
            return None
        return float(math.hypot(float(fx2) - float(fx1), float(fy2) - float(fy1)) / px_per_m)
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return None


def person_separation(p1, p2, calibrator: SpatialCalibrator) -> float | None:
    """Return ground distance in meters (surveyed homography, else body-height scale)."""
    if calibrator is not None and getattr(calibrator, "calibrated", False):
        try:
            dist_m = float(calibrator.calculate_distance(p1["foot"], p2["foot"]))
        except (KeyError, TypeError, ValueError, ZeroDivisionError):
            dist_m = None
        if dist_m is not None and math.isfinite(dist_m) and dist_m >= 0:
            return dist_m
    return _body_height_meters(p1, p2)


def calculate_person_distances(people, frame_width=1920, pool_real_width_m=15.0, calibrator: SpatialCalibrator | None = None):
    """Calculate pairwise distances between all pairs of people in real-world meters."""
    distances = []
    for i, p1 in enumerate(people):
        for j, p2 in enumerate(people):
            if i >= j:
                continue
            fx1, fy1 = p1['foot']
            fx2, fy2 = p2['foot']
            # Never label a pixel or body-size estimate as meters.
            dist_m = person_separation(p1, p2, calibrator) if calibrator is not None else None
            distances.append({
                'person1': p1['id'],
                'person2': p2['id'],
                'distance_m': dist_m
            })
    return distances


def check_supervision(people, supervision_cfg, frame_width_or_calibrator):
    """
    Check if individuals in pool zones are supervised, regardless of age or height.

    Proximity Threshold Requirement:
    - An individual is classified as 'supervised' ONLY IF another detected person
      (standing in a supervisor zone) is within the threshold radius (default 0.7 m).
    - If the nearest other person is farther than the threshold, or nobody else is
      present, they are flagged as 'unsupervised'.
    """
    if not supervision_cfg.get('enabled', False):
        return []

    if isinstance(frame_width_or_calibrator, SpatialCalibrator):
        calibrator = frame_width_or_calibrator
    else:
        fw = float(frame_width_or_calibrator) if frame_width_or_calibrator else 1920.0
        pool_w = float(supervision_cfg.get('pool_real_width_meters', 15.0))
        pool_l = float(supervision_cfg.get('pool_real_length_meters', 25.0))
        calibrator = SpatialCalibrator(pool_width_m=pool_w, pool_length_m=pool_l, frame_size=(int(fw), int(fw * 9 / 16)))

    threshold = float(supervision_cfg.get('threshold_meters', 0.7))
    # Proximity / unsupervised alerts apply only inside the yellow monitoring zone.
    check_zones = supervision_cfg.get('check_zones', ['yellow'])
    supervisor_zones = supervision_cfg.get('supervisor_zones', ['clear', 'yellow', 'red', 'orange'])

    for p in people:
        foot = p.get('foot', (0.0, 0.0))
        p['metric_pos'] = calibrator.pixel_to_metric(foot[0], foot[1]) if calibrator.calibrated else None

    candidates = [p for p in people if p['zone'] in supervisor_zones]
    people_in_pool = [p for p in people if p['zone'] in check_zones]
    unsupervised = []

    for person in people:
        if person['zone'] not in check_zones:
            person['supervised'] = None
            person['supervision_data'] = {
                'supervised': None,
                'status': 'outside',
                'distance_reliable': False,
                'separation_distance': None,
                'supervision_threshold': threshold,
                'nearest_person_id': None,
                'boundary_direction': 'outside',
            }

    for person in people_in_pool:
        nearest_distance = float('inf')
        nearest_person_id = None

        for other in candidates:
            if other['id'] == person['id']:
                continue
            dist_m = person_separation(person, other, calibrator)
            if dist_m is not None and dist_m < nearest_distance:
                nearest_distance = dist_m
                nearest_person_id = other['id']

        if nearest_person_id is not None:
            status = 'supervised' if nearest_distance <= threshold else 'unsupervised'
        else:
            # Alone, or no usable distance — treat as unsupervised (never UNKNOWN).
            status = 'unsupervised'
        has_supervision = status == 'supervised'

        person['supervised'] = has_supervision
        sep_dist = round(nearest_distance, 2) if nearest_distance != float('inf') else None
        person['supervision_data'] = {
            'supervised': has_supervision,
            'status': status,
            'distance_reliable': nearest_person_id is not None and bool(getattr(calibrator, 'calibrated', False)),
            'separation_distance': sep_dist,
            'supervision_threshold': threshold,
            'nearest_person_id': nearest_person_id,
            'boundary_direction': 'monitored' if status == 'supervised' else 'toward_pool',
        }

        if status == 'unsupervised':
            unsupervised.append(person)
    return unsupervised


def polygon_contains_points(outer, pts) -> bool:
    return all(point_in_polygon(x, y, outer) for x, y in pts)


def validate_nesting(zcfg) -> list[str]:
    """Red and orange must each stay inside yellow in the config coordinate space."""
    warnings = []
    yellow = zcfg["yellow"].get("points") or []
    red = zcfg["red"].get("points") or []
    orange = zcfg["orange"].get("points") or []
    if len(yellow) >= 3 and len(red) >= 3 and not polygon_contains_points(yellow, red):
        warnings.append("red is not fully inside yellow")
    if len(yellow) >= 3 and len(orange) >= 2 and not polygon_contains_points(yellow, orange):
        warnings.append("orange is not fully inside yellow")
    return warnings


def foot_point(xyxy, kxy, kcf, kpt_conf):
    """Prefer ankle midpoint, then one ankle, then bbox bottom-center — never box center."""
    left = right = None
    if kxy is not None:
        lx, ly = float(kxy[LEFT_ANKLE][0]), float(kxy[LEFT_ANKLE][1])
        rx, ry = float(kxy[RIGHT_ANKLE][0]), float(kxy[RIGHT_ANKLE][1])
        lc = float(kcf[LEFT_ANKLE]) if kcf is not None else 1.0
        rc = float(kcf[RIGHT_ANKLE]) if kcf is not None else 1.0
        if lx > 1 and ly > 1 and lc >= kpt_conf:
            left = (lx, ly, lc)
        if rx > 1 and ry > 1 and rc >= kpt_conf:
            right = (rx, ry, rc)
        if left and right:
            return (left[0] + right[0]) / 2.0, (left[1] + right[1]) / 2.0, "ankles", left, right
        if left:
            return left[0], left[1], "ankle_l", left, right
        if right:
            return right[0], right[1], "ankle_r", left, right
    x1, y1, x2, y2 = (float(v) for v in xyxy)
    return (x1 + x2) / 2.0, y2, "bbox_bottom", left, right


def in_orange_shape(x, y, orange, orange_proximity_px) -> bool:
    pts = orange["points"]
    geom = orange.get("geometry", "polygon")
    if not orange["enabled"] or len(pts) < 2:
        return False
    if geom != "polyline" and len(pts) >= 3:
        return point_in_polygon(x, y, pts)
    return dist_to_polyline(x, y, pts) <= orange_proximity_px


def classify_zone(x, y, zones_px, orange_proximity_px) -> str:
    """Innermost zone whose own shape contains the point."""
    def inside(key):
        z = zones_px[key]
        return z["enabled"] and len(z["points"]) >= 3 and point_in_polygon(x, y, z["points"])

    if in_orange_shape(x, y, zones_px["orange"], orange_proximity_px):
        return "orange"
    if inside("red"):
        return "red"
    if inside("yellow"):
        return "yellow"
    return "clear"


def crossing_event(prev_zone, zone):
    if prev_zone is None or prev_zone == zone:
        return None, False
    return CROSSING_EVENTS.get((prev_zone, zone), (None, False))


DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _hhmm_to_minutes(value: str) -> int:
    h, m = str(value).split(":")
    return int(h) * 60 + int(m)


def is_open_at(schedule: dict, day_key: str, minutes: int) -> bool:
    """Same rule as backend/operatingHours.js: close <= open spills into the next day."""
    today = schedule.get(day_key) or {}
    if today and not today.get("closed"):
        o, c = _hhmm_to_minutes(today["open"]), _hhmm_to_minutes(today["close"])
        if (o <= minutes < c) if c > o else (minutes >= o):
            return True
    prev = schedule.get(DAY_KEYS[(DAY_KEYS.index(day_key) + 6) % 7]) or {}
    if prev and not prev.get("closed"):
        o, c = _hhmm_to_minutes(prev["open"]), _hhmm_to_minutes(prev["close"])
        if c <= o and minutes < c:
            return True
    return False


def site_clock(hours: dict, now: datetime | None = None) -> tuple[str, int]:
    """(day key, minutes since midnight) at the site."""
    now_utc = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    local = None
    tz_name = hours.get("timezone")
    if tz_name:
        try:
            local = now_utc.astimezone(ZoneInfo(tz_name))
        except (ZoneInfoNotFoundError, ValueError):
            local = None
    if local is None:
        offset = hours.get("utcOffsetMinutes")
        local = now_utc + timedelta(minutes=int(offset)) if offset is not None else now_utc.astimezone()
    return DAY_KEYS[local.weekday()], local.hour * 60 + local.minute


def is_after_hours(hours: dict | None, now: datetime | None = None) -> bool:
    if not hours or not hours.get("enabled"):
        return False
    schedule = hours.get("schedule") or {}
    day, minutes = site_clock(hours, now)
    try:
        return not is_open_at(schedule, day, minutes)
    except (KeyError, ValueError):
        return False


@dataclass
class PersonState:
    id: int
    zone: str = "clear"
    prev_zone: str = "clear"
    foot: tuple[float, float] = (0.0, 0.0)
    last_seen: float = 0.0
    last_event: str | None = None
    last_event_time: float = 0.0
    last_alert_key: str | None = None
    
    supervised: bool | None = None
    supervision_status: str = "outside"
    smoothed_distance: float | None = None
    nearest_person_id: int | None = None
    last_person_seen_time: float = 0.0
    last_supervision_check: float = 0.0
    supervision_history: list = field(default_factory=list)
    after_hours: bool = False
    in_check_zone: bool = False
    pending_zone: str | None = None
    pending_zone_hits: int = 0


@dataclass
class PersonTracker:
    cooldown_sec: float = 3.0
    lost_sec: float = 2.0
    supervision_cooldown_sec: float = 10.0
    states: dict[int, PersonState] = field(default_factory=dict)
    sightings: dict[int, list] = field(default_factory=dict)
    confirmed: set = field(default_factory=set)

    def prune(self, now: float):
        dead = [i for i, s in self.states.items() if now - s.last_seen > self.lost_sec]
        for i in dead:
            del self.states[i]
        for i in [i for i, seen in self.sightings.items() if not seen or now - seen[-1] > self.lost_sec]:
            del self.sightings[i]
            self.confirmed.discard(i)

    def confirm(self, track_id: int, now: float, hits: int, window_sec: float) -> bool:
        """True once a track has passed the person check `hits` times within `window_sec`."""
        if hits <= 1 or track_id in self.confirmed:
            return True
        seen = [t for t in self.sightings.get(track_id, []) if now - t <= window_sec]
        seen.append(now)
        self.sightings[track_id] = seen
        if len(seen) >= hits:
            self.confirmed.add(track_id)
            return True
        return False

    def update(self, track_id: int, zone: str, foot, now: float, confirm_hits: int = 1):
        st = self.states.get(track_id)
        if st is None:
            prev = "clear"
            st = PersonState(id=track_id, zone=prev, prev_zone=prev, last_seen=now)
            self.states[track_id] = st
        else:
            prev = st.zone

        # Confirm polygon transitions across consecutive detections so ankle or
        # bbox-bottom jitter on an exact boundary does not create false alerts.
        if zone == prev:
            st.pending_zone, st.pending_zone_hits = None, 0
            stable_zone = prev
        else:
            if st.pending_zone == zone:
                st.pending_zone_hits += 1
            else:
                st.pending_zone, st.pending_zone_hits = zone, 1
            stable_zone = zone if st.pending_zone_hits >= max(1, int(confirm_hits)) else prev
            if stable_zone == zone:
                st.pending_zone, st.pending_zone_hits = None, 0

        event, is_alert = crossing_event(prev, stable_zone)
        if event and st.last_event == event and (now - st.last_event_time) < self.cooldown_sec:
            event, is_alert = None, False

        st.prev_zone = prev
        st.zone = stable_zone
        st.foot = (float(foot[0]), float(foot[1]))
        st.last_seen = now
        if event:
            st.last_event = event
            st.last_event_time = now
            if is_alert:
                st.last_alert_key = event
        return st, event, is_alert

    def update_after_hours(self, people, now: float):
        """Outside operating hours everyone in view is unsupervised, with no debounce."""
        events = []
        for person in people:
            pid = person['id']
            st = self.states.get(pid)
            if st is None:
                st = PersonState(id=pid, zone=person.get('zone', 'clear'), prev_zone='clear', last_seen=now)
                self.states[pid] = st
            person['supervised'] = False
            person['supervision_data'] = {
                'supervised': False,
                'status': 'unsupervised',
                'distance_reliable': False,
                'after_hours': True,
                'separation_distance': None,
                'nearest_person_id': None,
                'boundary_direction': 'after_hours',
            }
            first_sighting = not st.after_hours
            st.after_hours = True
            st.supervised = False
            st.supervision_status = 'unsupervised'
            st.smoothed_distance = None
            if first_sighting or (now - st.last_supervision_check) > self.supervision_cooldown_sec:
                st.last_supervision_check = now
                events.append({
                    'id': pid,
                    'zone': person['zone'],
                    'event': 'AFTER_HOURS_PRESENCE',
                    'is_alert': True,
                    'supervision_data': dict(person['supervision_data']),
                })
        return events

    def update_supervision(self, people, supervision_cfg, frame_width_or_calibrator, now: float,
                           after_hours: bool = False):
        """
        A detected person is SUPERVISED only while another person is within
        threshold_meters. It is UNSUPERVISED when measured over threshold or alone,
        and UNKNOWN when people are present but no surveyed distance is available.
        Emits an event on entry and on every status change after that.
        After hours, the proximity rule is skipped and everyone is unsupervised.
        """
        if after_hours:
            return self.update_after_hours(people, now)
        for st in self.states.values():
            st.after_hours = False

        if not supervision_cfg.get('enabled', False):
            return []

        if isinstance(frame_width_or_calibrator, SpatialCalibrator):
            calibrator = frame_width_or_calibrator
        else:
            fw = float(frame_width_or_calibrator) if frame_width_or_calibrator else 1920.0
            pool_w = float(supervision_cfg.get('pool_real_width_meters', 15.0))
            pool_l = float(supervision_cfg.get('pool_real_length_meters', 25.0))
            calibrator = SpatialCalibrator(pool_width_m=pool_w, pool_length_m=pool_l, frame_size=(int(fw), int(fw * 9 / 16)))

        threshold = float(supervision_cfg.get('threshold_meters', 0.7))
        check_supervision(people, supervision_cfg, calibrator)

        events = []
        for person in people:
            pid = person['id']
            st = self.states.get(pid)
            if not st:
                check_zones_inner = supervision_cfg.get('check_zones', ['yellow'])
                if person.get('zone') not in check_zones_inner:
                    continue
                st = PersonState(
                    id=pid,
                    zone=person.get('zone', 'clear'),
                    prev_zone='clear',
                    last_seen=now,
                    last_supervision_check=now,
                )
                self.states[pid] = st

            check_zones = supervision_cfg.get('check_zones', ['yellow'])
            if person['zone'] not in check_zones:
                st.supervised = None
                st.supervision_status = 'outside'
                st.in_check_zone = False
                continue

            sup_data = person.get('supervision_data', {})
            raw_dist = sup_data.get('separation_distance')
            nearest_id = sup_data.get('nearest_person_id')
            st.nearest_person_id = nearest_id

            supervisor_zones = supervision_cfg.get('supervisor_zones', ['clear', 'yellow', 'red', 'orange'])
            alone = not any(
                p['id'] != pid and p['zone'] in supervisor_zones for p in people
            )
            if alone:
                raw_dist = None
                nearest_id = None

            status_now = str(sup_data.get('status') or 'unsupervised')
            if status_now not in ('supervised', 'unsupervised', 'after_hours', 'outside'):
                status_now = 'unsupervised'
            supervised_now = True if status_now == 'supervised' else False if status_now == 'unsupervised' else None
            entering = not st.in_check_zone
            st.in_check_zone = True
            st.smoothed_distance = raw_dist
            if not entering and status_now == st.supervision_status:
                continue

            was_supervised = st.supervised
            was_status = st.supervision_status
            st.supervised = supervised_now
            st.supervision_status = status_now
            st.last_supervision_check = now
            if supervised_now:
                st.last_person_seen_time = now
            if not entering:
                st.supervision_history.append({
                    'from': was_status.upper(),
                    'to': status_now.upper(),
                    'time': now,
                    'distance_m': round(raw_dist, 2) if raw_dist is not None else None,
                    'nearest_person_id': nearest_id,
                    'zone': person['zone'],
                })
            events.append({
                'id': pid,
                'zone': person['zone'],
                'event': 'SUPERVISED' if status_now == 'supervised' else 'UNSUPERVISED',
                'is_alert': status_now == 'unsupervised',
                'supervision_data': {
                    'supervised': supervised_now,
                    'status': status_now,
                    'distance_reliable': bool(sup_data.get('distance_reliable')),
                    'separation_distance': round(raw_dist, 2) if raw_dist is not None else None,
                    'supervision_threshold': threshold,
                    'nearest_person_id': nearest_id,
                    'boundary_direction': 'supervised' if status_now == 'supervised' else 'toward_pool' if status_now == 'unsupervised' else 'unknown',
                },
            })

        return events


def zone_pixels(zcfg, frame_w, frame_h):
    space = zcfg.get("coord_space", "editor")
    editor_size = zcfg.get("editor_size", [1000, 512])
    out = {}
    for key in ("yellow", "red", "orange"):
        block = zcfg[key]
        out[key] = {
            "enabled": bool(block.get("enabled", True)),
            "name": block.get("name", key),
            "geometry": block.get("geometry", "polygon"),
            "points": to_pixel_points(
                block.get("points") or [], frame_w, frame_h, space, editor_size
            ),
        }
    return out


def draw_zones(frame, zones_px):
    overlay = frame.copy()
    for key in ("yellow", "red", "orange"):
        z = zones_px[key]
        if not z["enabled"] or len(z["points"]) < 3 or z.get("geometry") == "polyline":
            continue
        pts = np.array(z["points"], dtype=np.int32)
        cv2.fillPoly(overlay, [pts], COLORS[key])
    frame[:] = cv2.addWeighted(overlay, 0.22, frame, 0.78, 0)
    for key in ("yellow", "red", "orange"):
        z = zones_px[key]
        if not z["enabled"] or len(z["points"]) < 2:
            continue
        pts = np.array(z["points"], dtype=np.int32)
        closed = z.get("geometry") != "polyline" and len(z["points"]) >= 3
        thickness = 3 if key == "orange" else 2
        cv2.polylines(frame, [pts], isClosed=closed, color=COLORS[key], thickness=thickness)


def draw_skeleton(frame, kxy, kcf, kpt_conf, bounds=None):
    if kxy is None:
        return
    padded = None
    if bounds is not None:
        x1, y1, x2, y2 = (float(v) for v in bounds)
        pad_x, pad_y = max(4.0, (x2 - x1) * 0.15), max(4.0, (y2 - y1) * 0.15)
        padded = (x1 - pad_x, y1 - pad_y, x2 + pad_x, y2 + pad_y)

    def visible(index):
        x, y = float(kxy[index][0]), float(kxy[index][1])
        confidence = float(kcf[index]) if kcf is not None else 1.0
        if min(x, y) <= 1 or confidence < kpt_conf:
            return False
        return padded is None or (padded[0] <= x <= padded[2] and padded[1] <= y <= padded[3])

    for a, b in SKELETON:
        xa, ya = float(kxy[a][0]), float(kxy[a][1])
        xb, yb = float(kxy[b][0]), float(kxy[b][1])
        if not visible(a) or not visible(b):
            continue
        cv2.line(frame, (int(xa), int(ya)), (int(xb), int(yb)), COLORS["bone"], 3, cv2.LINE_AA)
    for index, point in enumerate(kxy):
        x, y = float(point[0]), float(point[1])
        if not visible(index):
            continue
        cv2.circle(frame, (int(x), int(y)), 4, (0, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(frame, (int(x), int(y)), 5, (25, 25, 25), 1, cv2.LINE_AA)


def draw_supervision_overlay(frame, people, calibrator: SpatialCalibrator | None = None, threshold_m: float = 0.7):
    """
    Render proximity lines on the CCTV frame between each person in a pool zone
    and the nearest other person, with a distance badge.
    """
    drawn_pairs = set()
    for p in people:
        sup_data = p.get('supervision_data', {})
        other_id = sup_data.get('nearest_person_id')
        sep_dist = sup_data.get('separation_distance')
        if other_id is None or other_id == p.get('id') or sep_dist is None:
            continue
        pair = frozenset((p.get('id'), other_id))
        if pair in drawn_pairs:
            continue
        other = next((s for s in people if s['id'] == other_id), None)
        if other and other.get('foot') and p.get('foot'):
            drawn_pairs.add(pair)
            cx, cy = int(p['foot'][0]), int(p['foot'][1])
            sx, sy = int(other['foot'][0]), int(other['foot'][1])
            is_sup = sup_data.get('supervised', False)
            line_color = (110, 156, 27) if is_sup else (74, 54, 214)
            cv2.line(frame, (cx, cy), (sx, sy), line_color, 2, cv2.LINE_AA)
            mx, my = (cx + sx) // 2, (cy + sy) // 2
            badge_txt = f"{sep_dist:.2f}m" + (" [OK]" if is_sup else f" [OVER {threshold_m:g}m]")
            (bw, bh), _ = cv2.getTextSize(badge_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(frame, (mx - bw//2 - 4, my - bh - 4), (mx + bw//2 + 4, my + 4), (0, 0, 0), -1)
            cv2.rectangle(frame, (mx - bw//2 - 4, my - bh - 4), (mx + bw//2 + 4, my + 4), line_color, 1)
            cv2.putText(frame, badge_txt, (mx - bw//2, my - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)


def supervision_label(person: dict, tracker: PersonTracker, enabled: bool = True) -> dict | None:
    """Per-person supervision status for the on-frame label."""
    if not enabled:
        return None
    sup = person.get('supervision_data') or {}
    base = {
        'separation_distance': sup.get('separation_distance'),
    }
    st = tracker.states.get(person['id'])
    if st is not None and st.after_hours:
        return {**base, 'status': 'after_hours', 'supervised': False}
    status = str((sup or {}).get('status') or (st.supervision_status if st else '') or 'outside')
    if status not in ('supervised', 'unsupervised', 'after_hours'):
        # Outside yellow / no proximity rule — do not show UNKNOWN.
        return None
    return {
        **base,
        'status': status,
        'supervised': st.supervised if st is not None else sup.get('supervised'),
    }


def _draw_compact_tags(frame, x, y_anchor, tags, placement="above"):
    """Draw short stacked activity/supervision tags without IDs or detail text."""
    if not tags:
        return
    font, scale, thickness, pad, gap = cv2.FONT_HERSHEY_SIMPLEX, 0.48, 2, 4, 2
    measured = [(text, color, *cv2.getTextSize(text, font, scale, thickness)[0]) for text, color in tags]
    row_h = max(height for _, _, _, height in measured) + pad * 2
    total_h = len(measured) * row_h + (len(measured) - 1) * gap
    if placement == "below":
        top = y_anchor + 2
        if top + total_h >= frame.shape[0]:
            top = max(0, y_anchor - total_h - 2)
    else:
        top = y_anchor - total_h - 2
        if top < 0:
            top = y_anchor + 2
    for text, color, width, height in measured:
        right = min(frame.shape[1] - 1, x + width + pad * 2)
        cv2.rectangle(frame, (x, top), (right, top + row_h), color, -1)
        cv2.putText(
            frame, text, (x + pad, top + row_h - pad - 1),
            font, scale, (255, 255, 255), thickness, cv2.LINE_AA,
        )
        top += row_h + gap


def draw_person(frame, track_id, xyxy, foot, src, left, right, kxy, kcf, kpt_conf, zone, event,
                supervision_data: dict | None = None, activity: dict | None = None,
                show_keypoints: bool = True, show_foot_markers: bool = True,
                show_supervision_indicator: bool = False):
    """Draw one box and one label per person; activity is the drowning model's class for them."""
    x1, y1, x2, y2 = (int(v) for v in xyxy)

    status = supervision_data.get('status') if supervision_data else None
    activity_name = str(activity.get("name") or "").strip() if activity else ""
    color = ACTIVITY_TAG_COLORS.get(activity_name.lower(), COLORS[BOX_COLOR.get(zone, "clear")])
    is_drowning = activity_name.lower() == "drowning" and bool(activity.get("alert"))
    if is_drowning:
        # Activity safety takes visual priority.
        color = ACTIVITY_TAG_COLORS["drowning"]

    if show_keypoints:
        draw_skeleton(frame, kxy, kcf, kpt_conf, bounds=xyxy)
        if left:
            cv2.circle(frame, (int(left[0]), int(left[1])), 5, COLORS["ankle_l"], -1)
        if right:
            cv2.circle(frame, (int(right[0]), int(right[1])), 5, COLORS["ankle_r"], -1)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    if show_supervision_indicator and status in ("supervised", "unsupervised", "after_hours"):
        indicator_color = COLORS["supervised"] if status == "supervised" else COLORS["unsupervised"]
        cv2.circle(frame, (x2, y1), 8, indicator_color, -1, cv2.LINE_AA)
        cv2.circle(frame, (x2, y1), 9, (255, 255, 255), 1, cv2.LINE_AA)
    if show_foot_markers:
        fx, fy = int(foot[0]), int(foot[1])
        cv2.circle(frame, (fx, fy), 7, COLORS["foot"], -1)
        cv2.circle(frame, (fx, fy), 9, color, 2)

    activity_tags = []
    if activity_name.lower() in ACTIVITY_TAG_COLORS:
        activity_tags.append((f"P{track_id} · {activity_name.upper()}", ACTIVITY_TAG_COLORS[activity_name.lower()]))
    # The camera overlay is activity-only. Supervision continues internally
    # for alert/dashboard logic but never changes the activity box or label.
    _draw_compact_tags(frame, x1, y1, activity_tags, placement="above")
    if show_foot_markers:
        cv2.putText(
            frame, f"foot={src}", (x1, min(frame.shape[0] - 8, y2 + 16)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.40, COLORS["foot"], 1, cv2.LINE_AA,
        )


def resolve_source(source: str, rtsp_url: str | None):
    raw = (source or "").strip()
    if raw.lower() in {"rtsp", "tapo", "camera"}:
        if not rtsp_url:
            sys.exit("[error] --source rtsp needs CAMERA.rtsp_url in config.json")
        return rtsp_url, "stream"
    if raw.lower().startswith("rtsp://"):
        return raw, "stream"
    path = Path(raw)
    if not path.exists():
        sys.exit(f"[error] source not found: {source}")
    if path.is_file() and path.suffix.lower() in VIDEO_EXTS:
        return str(path), "video"
    if path.is_file():
        return str(path), "image"
    found = sorted(p for p in path.rglob("*") if p.suffix.lower() in IMG_EXTS)
    if not found:
        sys.exit(f"[error] no images found under {path}")
    print(f"[zone] found {len(found)} image(s) under {path}")
    return [str(p) for p in found], "folder"


def people_from_result(result, tracked: bool = False):
    """Yield (id, box, keypoints, keypoint confidences) per detection."""
    if result.boxes is None or len(result.boxes) == 0:
        return
    n = len(result.boxes)
    xyxy = result.boxes.xyxy.cpu().numpy()
    if result.boxes.id is not None:
        ids = result.boxes.id.cpu().numpy().astype(int)
    elif tracked:
        return
    else:
        ids = np.arange(n)
    kxy = result.keypoints.xy.cpu().numpy() if result.keypoints is not None else None
    kcf = (
        result.keypoints.conf.cpu().numpy()
        if result.keypoints is not None and result.keypoints.conf is not None
        else None
    )
    for i in range(n):
        yield int(ids[i]), xyxy[i], (None if kxy is None else kxy[i]), (None if kcf is None else kcf[i])


HEAD_KEYPOINTS = slice(0, 5)  # nose, eyes, ears
SHOULDER_KEYPOINTS = slice(5, 7)
L_SHOULDER, R_SHOULDER, L_HIP, R_HIP = 5, 6, 11, 12


def person_filter_from_config(pose_cfg: dict) -> dict:
    return {
        "min_confidence": float(pose_cfg.get("person_confidence", 0.3)),
        "require_upper_body": bool(pose_cfg.get("require_upper_body", True)),
        "require_side_agreement": bool(pose_cfg.get("require_side_agreement", True)),
        "upper_body_keypoint_conf": float(pose_cfg.get("upper_body_keypoint_conf", 0.35)),
        "min_keypoints": int(pose_cfg.get("min_keypoints", 5)),
        "keypoint_conf": float(pose_cfg.get("keypoint_confidence", 0.3)),
        "min_keypoint_spread": float(pose_cfg.get("min_keypoint_spread", 0.3)),
        "min_box_px": float(pose_cfg.get("min_box_px", 12)),
        "max_aspect": float(pose_cfg.get("max_box_aspect", 5.0)),
        "confirm_hits": int(pose_cfg.get("confirm_hits", 3)),
        "confirm_window_sec": float(pose_cfg.get("confirm_window_sec", 1.5)),
        "nms_iou": float(pose_cfg.get("nms_iou", 0.5)),
        "merge_nested": True,
    }


def _sides_agree(kxy, ok, box_w: float) -> bool:
    """Shoulders and hips must face the same way; objects matched to a skeleton often cross them."""
    if not all(ok[i] for i in (L_SHOULDER, R_SHOULDER, L_HIP, R_HIP)):
        return True
    min_sep = 0.05 * box_w
    shoulder_dx = float(kxy[L_SHOULDER][0] - kxy[R_SHOULDER][0])
    hip_dx = float(kxy[L_HIP][0] - kxy[R_HIP][0])
    if abs(shoulder_dx) < min_sep or abs(hip_dx) < min_sep:
        return True
    return (shoulder_dx > 0) == (hip_dx > 0)


def looks_like_person(box_conf, kcf, person_filter: dict | None, xyxy=None, kxy=None) -> bool:
    """Accept a pose detection only when its skeleton is shaped like a human body."""
    if not person_filter:
        return True
    if box_conf is not None and box_conf < float(person_filter.get("min_confidence", 0.0)):
        return False

    if xyxy is not None:
        box_w, box_h = float(xyxy[2] - xyxy[0]), float(xyxy[3] - xyxy[1])
        if min(box_w, box_h) < float(person_filter.get("min_box_px", 0.0)):
            return False
        max_aspect = float(person_filter.get("max_aspect", 0.0))
        if max_aspect > 0 and max(box_w, box_h) > max_aspect * max(1.0, min(box_w, box_h)):
            return False
    else:
        box_w = box_h = 0.0

    if kcf is None:
        return not person_filter.get("require_upper_body", False)
    kcf = np.asarray(kcf)

    if person_filter.get("require_upper_body", False):
        thr = float(person_filter.get("upper_body_keypoint_conf", 0.35))
        shoulders = int((kcf[SHOULDER_KEYPOINTS] >= thr).sum())
        head = int((kcf[HEAD_KEYPOINTS] >= thr).sum())
        if not (shoulders >= 2 or (shoulders >= 1 and head >= 1)):
            return False

    ok = kcf >= float(person_filter.get("keypoint_conf", 0.3))
    if int(ok.sum()) < int(person_filter.get("min_keypoints", 0)):
        return False

    if kxy is not None and xyxy is not None and ok.any():
        pts = np.asarray(kxy)[ok]
        spread = max(float(np.ptp(pts[:, 0])), float(np.ptp(pts[:, 1])))
        if spread < float(person_filter.get("min_keypoint_spread", 0.0)) * max(box_w, box_h):
            return False
        if person_filter.get("require_side_agreement", True) and not _sides_agree(np.asarray(kxy), ok, box_w):
            return False
    return True


def _overlap_of_smaller(a, b) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return inter / smaller if smaller > 0 else 0.0


def _same_skeleton(a, b, kpt_conf) -> bool:
    """Two detections whose shared joints sit on top of each other are one person drawn twice."""
    (_, _, xa, ka, ca, _), (_, _, xb, kb, cb, _) = a, b
    if ka is None or kb is None or ca is None or cb is None:
        return False
    both = (np.asarray(ca) >= kpt_conf) & (np.asarray(cb) >= kpt_conf)
    if int(both.sum()) < 3:
        return False
    scale = max(1.0, min(xa[3] - xa[1], xb[3] - xb[1], max(xa[2] - xa[0], xb[2] - xb[0])))
    gaps = np.linalg.norm(np.asarray(ka)[both] - np.asarray(kb)[both], axis=1)
    return float(np.median(gaps)) <= 0.1 * scale


def process_result(result, zcfg, tracker: PersonTracker, kpt_conf, persist: bool,
                   draw_zone_overlay: bool = True, draw_people: bool = True,
                   person_filter: dict | None = None):
    frame = result.orig_img.copy()
    h, w = frame.shape[:2]
    zones_px = zone_pixels(zcfg, w, h)
    orange_px = zcfg.get("orange_proximity", 0.02) * w
    transition_hits = max(1, int(zcfg.get("transition_confirm_hits", 2)))
    now = time.time()
    if persist:
        tracker.prune(now)

    if draw_zone_overlay:
        draw_zones(frame, zones_px)
    reports = []
    box_conf = result.boxes.conf.cpu().numpy() if result.boxes is not None and result.boxes.conf is not None else None
    confirm_hits = int(person_filter.get("confirm_hits", 1)) if person_filter and persist else 1
    confirm_window = float(person_filter.get("confirm_window_sec", 1.5)) if person_filter else 0.0
    candidates = []
    for i, (track_id, xyxy, kxy, kcf) in enumerate(people_from_result(result, tracked=persist) or []):
        c = None if box_conf is None else float(box_conf[i])
        if confirm_hits > 1 and track_id in tracker.confirmed:
            if c is not None and c < float(person_filter.get("min_confidence", 0.0)):
                continue
        elif not looks_like_person(c, kcf, person_filter, xyxy, kxy):
            continue
        elif not tracker.confirm(track_id, now, confirm_hits, confirm_window):
            continue
        candidates.append((i, track_id, xyxy, kxy, kcf, c or 0.0))
    if person_filter and person_filter.get("merge_nested", True):
        # Keep one box per swimmer when boxes or skeletons overlap
        kept = []
        for cand in sorted(candidates, key=lambda item: item[5], reverse=True):
            duplicate = any(
                _overlap_of_smaller(cand[2], k[2]) >= 0.7
                or (_overlap_of_smaller(cand[2], k[2]) >= 0.3 and _same_skeleton(cand, k, kpt_conf))
                for k in kept
            )
            if not duplicate:
                kept.append(cand)
        candidates = sorted(kept, key=lambda item: item[0])
    for i, track_id, xyxy, kxy, kcf, _ in candidates:
        fx, fy, src, left, right = foot_point(xyxy, kxy, kcf, kpt_conf)
        zone = classify_zone(fx, fy, zones_px, orange_px)
        if persist:
            st, event, is_alert = tracker.update(
                track_id, zone, (fx, fy), now, confirm_hits=transition_hits,
            )
            zone = st.zone
        else:
            event, is_alert = None, False
            st = None
        if draw_people:
            draw_person(frame, track_id, xyxy, (fx, fy), src, left, right, kxy, kcf, kpt_conf, zone, event)
        reports.append({
            "id": track_id,
            "conf": None if box_conf is None else round(float(box_conf[i]), 2),
            "foot": (round(fx, 1), round(fy, 1)),
            "source": src,
            "zone": zone,
            "prev_zone": None if st is None else st.prev_zone,
            "event": event,
            "is_alert": is_alert,
            "xyxy": xyxy,
            "kxy": kxy,
            "kcf": kcf,
        })
    return frame, reports


def run_self_test() -> int:
    """Logic checks that do not need the camera or weights."""
    failed = 0

    def check(name, cond):
        nonlocal failed
        if cond:
            print(f"  ok  {name}")
        else:
            print(f"  FAIL {name}")
            failed += 1

    yellow = [(0, 0), (100, 0), (100, 100), (0, 100)]
    red = [(20, 20), (80, 20), (80, 80), (20, 80)]
    orange = [(40, 40), (60, 40), (60, 60), (40, 60)]
    check("red ⊂ yellow", polygon_contains_points(yellow, red))
    check("orange ⊂ yellow", polygon_contains_points(yellow, orange))
    check("orange need not be inside red", not polygon_contains_points(
        [(0, 0), (10, 0), (10, 10), (0, 10)], orange,
    ))

    zcfg = {
        "yellow": {"enabled": True, "points": yellow, "geometry": "polygon"},
        "red": {"enabled": True, "points": red, "geometry": "polygon"},
        "orange": {"enabled": True, "points": orange, "geometry": "polygon"},
    }
    check("point in yellow only", classify_zone(10, 10, zcfg, 1) == "yellow")
    check("point in red", classify_zone(30, 30, zcfg, 1) == "red")
    check("point in orange", classify_zone(50, 50, zcfg, 1) == "orange")
    check("point outside", classify_zone(200, 200, zcfg, 1) == "clear")
    small_yellow = {**zcfg, "yellow": {"enabled": True, "points": [[0, 0], [20, 0], [20, 20], [0, 20]]}}
    check("orange outside a smaller yellow still orange", classify_zone(50, 50, small_yellow, 1) == "orange")
    check("red outside a smaller yellow still red", classify_zone(30, 30, small_yellow, 1) == "red")

    ev, alert = crossing_event("clear", "yellow")
    check("OUTSIDE→YELLOW monitor", ev == "ENTERED POOL AREA" and alert is False)
    ev, alert = crossing_event("yellow", "red")
    check("YELLOW→RED alert", ev == "RED BOUNDARY CROSSED" and alert is True)
    ev, alert = crossing_event("red", "orange")
    check("RED→ORANGE deep pool", ev == "DEEP POOL ENTRY" and alert is True)
    ev, alert = crossing_event("orange", "red")
    check("ORANGE→RED leaving is not logged", ev is None and alert is False)
    ev, alert = crossing_event("yellow", "clear")
    check("YELLOW→OUTSIDE leaving is not logged", ev is None and alert is False)
    ev, alert = crossing_event("red", "red")
    check("same zone no event", ev is None and alert is False)

    tr = PersonTracker(cooldown_sec=10.0, lost_sec=2.0)
    t0 = time.time()
    _, e1, a1 = tr.update(1, "yellow", (10, 10), t0)
    _, e2, a2 = tr.update(1, "red", (30, 30), t0 + 0.1)
    _, e3, a3 = tr.update(1, "red", (31, 31), t0 + 0.2)
    _, e4, a4 = tr.update(1, "orange", (50, 50), t0 + 0.3)
    check("first enter yellow", e1 == "ENTERED POOL AREA" and a1 is False)
    check("then red alert once", e2 == "RED BOUNDARY CROSSED" and a2 is True)
    check("stay red no repeat", e3 is None and a3 is False)
    check("then orange alert", e4 == "DEEP POOL ENTRY" and a4 is True)
    _, e5, a5 = tr.update(1, "orange", (51, 51), t0 + 0.4)
    check("stay orange no repeat", e5 is None and a5 is False)

    jitter = PersonTracker()
    _, j1, _ = jitter.update(7, "red", (30, 30), t0, confirm_hits=2)
    _, j2, _ = jitter.update(7, "clear", (101, 101), t0 + 0.1, confirm_hits=2)
    _, j3, _ = jitter.update(7, "red", (30, 30), t0 + 0.2, confirm_hits=2)
    _, j4, j4_alert = jitter.update(7, "red", (30, 30), t0 + 0.3, confirm_hits=2)
    check("single-frame boundary jitter creates no crossing", j1 is None and j2 is None and j3 is None)
    check("confirmed repeated boundary crossing creates one alert", j4 == "RED BOUNDARY CROSSED" and j4_alert)

    kxy = np.zeros((17, 2), dtype=float)
    kcf = np.zeros(17, dtype=float)
    kxy[15] = [10, 80]
    kxy[16] = [20, 80]
    kcf[15] = kcf[16] = 0.9
    fx, fy, src, *_ = foot_point([0, 0, 30, 100], kxy, kcf, 0.3)
    check("ankle midpoint", src == "ankles" and abs(fx - 15) < 0.1 and abs(fy - 80) < 0.1)
    kcf[16] = 0.05
    fx, fy, src, *_ = foot_point([0, 0, 30, 100], kxy, kcf, 0.3)
    check("one ankle", src == "ankle_l" and abs(fx - 10) < 0.1)
    kcf[15] = 0.05
    fx, fy, src, *_ = foot_point([0, 0, 30, 100], kxy, kcf, 0.3)
    check("bbox bottom fallback", src == "bbox_bottom" and abs(fx - 15) < 0.1 and abs(fy - 100) < 0.1)

    # --- Supervision Proximity, Calibration & Anti-Jitter Tests ---
    cal = SpatialCalibrator.from_reference_points(
        [(100, 100), (900, 100), (900, 500), (100, 500)],
        [(0.0, 0.0), (15.0, 0.0), (15.0, 25.0), (0.0, 25.0)],
    )
    # Check 1: Metric distance precision using spatial transformation
    pt1_px = cal.metric_to_pixel(5.0, 10.0)
    pt2_px = cal.metric_to_pixel(5.0, 10.65)  # 0.65m away (<= 0.7m)
    pt3_px = cal.metric_to_pixel(5.0, 10.85)  # 0.85m away (> 0.7m)
    d_within = cal.calculate_distance(pt1_px, pt2_px)
    d_over = cal.calculate_distance(pt1_px, pt3_px)
    check("calibrator metric distance within (0.65m)", abs(d_within - 0.65) < 0.01)
    check("calibrator metric distance over (0.85m)", abs(d_over - 0.85) < 0.01)

    sup_cfg = {
        "enabled": True,
        "threshold_meters": 0.7,
        "check_zones": ["yellow", "red", "orange"],
        "supervisor_zones": ["clear", "yellow", "red", "orange"],
    }

    # Check 2: Person within 0.7m of another person -> SUPERVISED (no age/height involved)
    p_anchor = {"id": 10, "foot": pt1_px, "zone": "yellow", "xyxy": [100, 100, 150, 220]}
    p_near = {"id": 20, "foot": pt2_px, "zone": "yellow", "xyxy": [150, 120, 180, 180]}  # 0.65m away
    unsupervised_res = check_supervision([p_anchor, p_near], sup_cfg, cal)
    check("person <= 0.7m from another person is supervised",
          p_near.get("supervised") is True and p_anchor.get("supervised") is True and len(unsupervised_res) == 0)
    check("no age/role fields are attached", "role" not in p_near and "is_supervisor" not in p_near)

    # Check 3: Person > 0.7m from anyone else -> UNSUPERVISED
    p_far = {"id": 21, "foot": pt3_px, "zone": "yellow", "xyxy": [150, 120, 180, 180]}  # 0.85m away
    unsupervised_res2 = check_supervision([p_anchor, p_far], sup_cfg, cal)
    check("person > 0.7m from everyone is unsupervised",
          p_far.get("supervised") is False and len(unsupervised_res2) == 2)

    # Check 4: Box size does not matter — a small and a tall box 0.4m apart supervise each other
    pt_c1 = cal.metric_to_pixel(8.0, 12.0)
    pt_c2 = cal.metric_to_pixel(8.0, 12.4)  # 0.4m apart
    c1 = {"id": 31, "foot": pt_c1, "zone": "yellow", "xyxy": [0, 0, 20, 30]}
    c2 = {"id": 32, "foot": pt_c2, "zone": "yellow", "xyxy": [0, 0, 40, 200]}
    unsupervised_pair = check_supervision([c1, c2], sup_cfg, cal)
    check("two people 0.4m apart are both supervised regardless of size",
          len(unsupervised_pair) == 0 and c1.get("supervised") is True and c2.get("supervised") is True)

    # Check 4b: Person on the deck (clear zone) within 0.7m still counts as supervision
    p_deck = {"id": 33, "foot": pt1_px, "zone": "clear"}
    p_pool = {"id": 34, "foot": pt2_px, "zone": "yellow"}
    unsupervised_deck = check_supervision([p_deck, p_pool], sup_cfg, cal)
    check("deck person within 0.7m supervises pool person", p_pool.get("supervised") is True and len(unsupervised_deck) == 0)

    # Check 4c: Without surveyed calibration, body-height scale still yields supervised/unsupervised.
    zone_cal = SpatialCalibrator.from_zone_polygon(
        [(380, 300), (520, 300), (560, 420), (340, 420)], frame_size=(960, 540),
    )
    check("drawn-zone calibrator is not treated as surveyed", zone_cal.calibrated is False)
    adult = {"id": 51, "foot": (430, 400), "zone": "yellow", "xyxy": [400, 200, 460, 400]}
    beside = {"id": 52, "foot": (485, 400), "zone": "yellow", "xyxy": [455, 205, 515, 400]}
    body_scale = check_supervision([adult, beside], sup_cfg, zone_cal)
    check("uncalibrated pair uses body-height scale (never UNKNOWN)",
          adult["supervision_data"]["status"] in ("supervised", "unsupervised")
          and beside["supervision_data"]["status"] in ("supervised", "unsupervised")
          and adult["supervision_data"]["separation_distance"] is not None
          and "unknown" not in (adult["supervision_data"]["status"], beside["supervision_data"]["status"]))
    check("nearby uncalibrated pair is supervised via body scale",
          adult.get("supervised") is True and beside.get("supervised") is True and len(body_scale) == 0)
    solo_uncalibrated = {"id": 53, "foot": (481, 400), "zone": "yellow"}
    solo_result = check_supervision([solo_uncalibrated], sup_cfg, zone_cal)
    check("uncalibrated solo detection is reliably unsupervised",
          solo_uncalibrated["supervision_data"]["status"] == "unsupervised"
          and len(solo_result) == 1)

    # Check 4d: Proximity / unsupervised logic is yellow-only by default.
    yellow_only = {
        "enabled": True,
        "threshold_meters": 0.7,
        "check_zones": ["yellow"],
        "supervisor_zones": ["clear", "yellow", "red", "orange"],
    }
    in_red = {"id": 61, "foot": pt1_px, "zone": "red", "xyxy": [100, 100, 150, 220]}
    alone_red = check_supervision([in_red], yellow_only, cal)
    check("person in red is outside proximity check (no unsupervised)",
          in_red["supervision_data"]["status"] == "outside" and len(alone_red) == 0)

    # Check 5: Status follows the current frame exactly — no smoothing or grace periods
    tr = PersonTracker()
    t_start = time.time()
    tr.update(10, "yellow", pt1_px, t_start)
    tr.update(20, "yellow", pt2_px, t_start)
    tr.update_supervision([p_anchor, p_near], sup_cfg, cal, t_start)
    check("0.65m apart -> supervised", tr.states[20].supervised is True)
    p_apart = dict(p_near, foot=pt3_px)
    ev_apart = tr.update_supervision([p_anchor, p_apart], sup_cfg, cal, t_start + 0.1)
    check("one frame at 0.85m -> UNSUPERVISED immediately",
          tr.states[20].supervised is False and any(e.get("event") == "UNSUPERVISED" for e in ev_apart))
    check("UNSUPERVISED event carries no age/role data",
          all('role' not in e['supervision_data'] and 'adult_confidence' not in e['supervision_data'] for e in ev_apart))
    ev_back = tr.update_supervision([p_anchor, p_near], sup_cfg, cal, t_start + 0.2)
    check("back within 0.7m -> SUPERVISED immediately",
          tr.states[20].supervised is True and any(e.get("event") == "SUPERVISED" for e in ev_back))
    ev_gone = tr.update_supervision([p_near], sup_cfg, cal, t_start + 0.3)
    check("companion leaves view -> UNSUPERVISED immediately",
          tr.states[20].supervised is False and [e.get("event") for e in ev_gone] == ["UNSUPERVISED"])
    check("no repeat event while status unchanged",
          tr.update_supervision([p_near], sup_cfg, cal, t_start + 0.4) == [])

    # Check 9: Solo person entering the pool area is UNSUPERVISED on the first frame, alerted once
    tracker_solo = PersonTracker()
    t_solo = time.time() + 100.0
    tracker_solo.update(99, "yellow", pt2_px, t_solo)
    p_solo = {'id': 99, 'foot': pt2_px, 'zone': 'yellow', 'xyxy': None}
    ev_solo_early = tracker_solo.update_supervision([p_solo], sup_cfg, cal, t_solo)
    check("solo person flagged UNSUPERVISED on pool entry (no 'SUPERVISED | alone')",
          tracker_solo.states[99].supervised is False and
          [e.get("event") for e in ev_solo_early] == ["UNSUPERVISED"])
    later_solo = []
    for fi in range(4):
        later_solo += tracker_solo.update_supervision([p_solo], sup_cfg, cal, t_solo + fi * 0.1 + 0.05)
    check("solo person stays UNSUPERVISED without duplicate alerts",
          tracker_solo.states[99].supervised is False and later_solo == [])

    # Check 9b: Entering beside a nearby person is SUPERVISED immediately
    tracker_pair = PersonTracker()
    p_a = {'id': 1, 'foot': pt2_px, 'zone': 'yellow', 'xyxy': None}
    p_b = {'id': 2, 'foot': (pt2_px[0] + 2, pt2_px[1]), 'zone': 'clear', 'xyxy': None}
    tracker_pair.update(1, "yellow", pt2_px, t_solo)
    ev_pair = tracker_pair.update_supervision([p_a, p_b], sup_cfg, cal, t_solo)
    check("pool entry next to someone is SUPERVISED with an info event, not an alert",
          tracker_pair.states[1].supervised is True and
          [(e["event"], e["is_alert"]) for e in ev_pair] == [("SUPERVISED", False)])

    # --- After-hours schedule ---
    week = {d: {"open": "06:00", "close": "21:00", "closed": False} for d in DAY_KEYS}
    # No timezone name → uses the backend-supplied UTC offset (UTC+8). 2026-10-05 is a Monday.
    hours = {"enabled": True, "timezone": None, "utcOffsetMinutes": 480, "schedule": week}
    mon_2000 = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
    mon_2200 = datetime(2026, 10, 5, 14, 0, tzinfo=timezone.utc)
    check("site clock uses UTC offset fallback", site_clock(hours, mon_2000) == ("mon", 20 * 60))
    check("inside operating hours is not after hours", is_after_hours(hours, mon_2000) is False)
    check("after closing time is after hours", is_after_hours(hours, mon_2200) is True)
    check("rule disabled is never after hours", is_after_hours({**hours, "enabled": False}, mon_2200) is False)
    check("missing schedule data is never after hours", is_after_hours(None, mon_2200) is False)

    overnight = dict(week, mon={"open": "18:00", "close": "02:00", "closed": False},
                     tue={"open": "06:00", "close": "21:00", "closed": True})
    tue_0100 = datetime(2026, 10, 5, 17, 0, tzinfo=timezone.utc)
    tue_0300 = datetime(2026, 10, 5, 19, 0, tzinfo=timezone.utc)
    check("overnight hours stay open past midnight",
          is_after_hours({**hours, "schedule": overnight}, tue_0100) is False)
    check("closed-all-day after overnight spill is after hours",
          is_after_hours({**hours, "schedule": overnight}, tue_0300) is True)

    # --- After-hours tracker: proximity is ignored, everyone is unsupervised immediately ---
    tracker_ah = PersonTracker(supervision_cooldown_sec=10.0)
    t_ah = time.time() + 500.0
    a1 = {"id": 41, "foot": pt_c1, "zone": "clear"}
    a2 = {"id": 42, "foot": pt_c2, "zone": "yellow"}  # 0.4m apart
    ev_ah = tracker_ah.update_supervision([a1, a2], sup_cfg, cal, t_ah, after_hours=True)
    check("after hours flags everyone at once, even close together and on the deck",
          sorted(e["id"] for e in ev_ah) == [41, 42] and all(e["event"] == "AFTER_HOURS_PRESENCE" for e in ev_ah))
    check("after-hours label shown", supervision_label(a1, tracker_ah)["status"] == "after_hours")
    ev_ah2 = tracker_ah.update_supervision([a1, a2], sup_cfg, cal, t_ah + 1.0, after_hours=True)
    check("after-hours alert not repeated within cooldown", len(ev_ah2) == 0)
    ev_ah3 = tracker_ah.update_supervision([a1, a2], sup_cfg, cal, t_ah + 12.0, after_hours=True)
    check("after-hours reminder after cooldown", len(ev_ah3) == 2)
    tracker_ah.update_supervision([a1, a2], sup_cfg, cal, t_ah + 13.0, after_hours=False)
    check("opening hours resume normal proximity labels",
          supervision_label(a2, tracker_ah)["status"] != "after_hours")


    print("[self-test] failed" if failed else "[self-test] all checks passed")
    return 1 if failed else 0


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", default="rtsp", help="image, folder, video, rtsp:// URL, or 'rtsp'")
    p.add_argument("--model", default=None, help="override POSE.model (default yolo11n-pose.pt)")
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    p.add_argument("--conf", type=float, default=None)
    p.add_argument("--save", action="store_true")
    p.add_argument("--show", action="store_true")
    p.add_argument("--no-show", action="store_true", help="disable the preview window (for headless tests)")
    p.add_argument("--max-frames", type=int, default=0, help="stop after N frames (0 = unlimited)")
    p.add_argument("--self-test", action="store_true", help="run zone/tracking unit checks and exit")
    args = p.parse_args()

    if args.self_test:
        sys.exit(run_self_test())

    cfg = load_full_config(args.config)
    zcfg = cfg["ZONES"]
    pose_cfg = cfg.get("POSE", {})
    track_cfg = cfg.get("TRACKING", {})
    camera_cfg = cfg.get("CAMERA", {})
    model_name = args.model or pose_cfg.get("model") or "yolo11n-pose.pt"
    model_path = Path(model_name)
    if not model_path.is_absolute():
        config_relative = args.config.resolve().parent / model_path
        if config_relative.exists():
            model_path = config_relative
    tracker_path = Path(str(pose_cfg.get("tracker") or "tracker.yaml"))
    if not tracker_path.is_absolute():
        tracker_path = args.config.resolve().parent / tracker_path
    tracker_name = str(tracker_path) if tracker_path.exists() else "botsort.yaml"
    imgsz = int(pose_cfg.get("imgsz", 640))
    conf = args.conf if args.conf is not None else float(
        pose_cfg.get("confidence_threshold", zcfg.get("confidence_threshold", 0.25))
    )
    kpt_conf = float(pose_cfg.get("keypoint_confidence", zcfg.get("keypoint_confidence", 0.3)))
    rtsp_url = camera_cfg.get("rtsp_url")
    source, kind = resolve_source(args.source, rtsp_url)

    for warn in validate_nesting(zcfg):
        print(f"[zone] WARN {warn}")

    print(f"[zone] config {args.config}")
    print(f"[zone] model={model_path} (dataset/person_pose is not used)")
    print(f"[zone] coord_space={zcfg.get('coord_space')} editor_size={zcfg.get('editor_size')}")
    print("[zone] Yellow contains separate Red / Orange areas | drowning stays in pose_logic.py")
    print(f"[zone] source={source if kind != 'stream' else 'rtsp stream'}")
    model = YOLO(str(model_path))

    show = (args.show or kind in {"stream", "video"}) and not args.no_show
    save = args.save or kind in {"image", "folder"}
    if save:
        OUT_DIR.mkdir(parents=True, exist_ok=True)

    use_track = kind in {"stream", "video"}
    if use_track:
        results = model.track(
            source=source, conf=conf, imgsz=imgsz, tracker=tracker_name,
            persist=True, stream=True, verbose=False,
        )
    else:
        results = model.predict(source=source, conf=conf, imgsz=imgsz, stream=True, verbose=False)

    tracker = PersonTracker(
        cooldown_sec=float(track_cfg.get("alert_cooldown_sec", 3.0)),
        lost_sec=float(track_cfg.get("lost_track_sec", 2.0)),
    )
    n_frames = 0
    n_people = 0
    n_alert = 0

    try:
        for result in results:
            n_frames += 1
            frame, reports = process_result(
                result, zcfg, tracker, kpt_conf, persist=use_track,
                person_filter=person_filter_from_config(pose_cfg),
            )
            n_people += len(reports)
            label = result.path or kind
            if not reports:
                print(f"  {label}: 0 person(s)")
            for r in reports:
                if r["is_alert"]:
                    n_alert += 1
                print(
                    f"  {label}: Person #{r['id']} | Zone: {ZONE_LABEL[r['zone']]} |"
                    f" Event: {r['event'] or '-'} | foot={r['source']}{r['foot']}"
                )

            if save and kind != "stream":
                name = Path(result.path).name if result.path else f"frame_{n_frames:06d}.jpg"
                cv2.imwrite(str(OUT_DIR / name), frame)
            if show:
                cv2.imshow("PoolsEye - zone check", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    print("[zone] quit")
                    break
            if args.max_frames and n_frames >= args.max_frames:
                print(f"[zone] reached --max-frames {args.max_frames}")
                break
    finally:
        if show:
            cv2.destroyAllWindows()

    print(f"\n[zone] frames={n_frames} people={n_people} alerts={n_alert}")
    if save and kind != "stream":
        print(f"[zone] annotated frames saved under {OUT_DIR}")


if __name__ == "__main__":
    main()
