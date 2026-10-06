"""
PoolsEye - live CCTV → YOLO pose → nested pool-zone intrusion.

Pipeline
--------
Tapo C320WS → RTSP → YOLO pose (default yolo11n-pose.pt) → person + 17
keypoints → ankle/foot point → ByteTrack ID → nested zone classify →
crossing events (with cooldown).

Zones (enforced orange ⊂ red ⊂ yellow):
  yellow  outer safety     OUTSIDE→YELLOW  start monitoring (not an alert)
  red     warning boundary YELLOW→RED      RED BOUNDARY CROSSED
  orange  deep pool        RED→ORANGE      DEEP POOL ENTRY

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
from pathlib import Path

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
    "adult": (110, 156, 27),        # #1B9C6E in BGR (Emerald green)
    "child": (10, 121, 182),        # #B6790A in BGR (Amber/Gold)
    "supervised": (110, 156, 27),   # Safe green
    "unsupervised": (74, 54, 214),  # Alert red #D6364A in BGR
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

# (from, to) → (hud text, counts as alert)
CROSSING_EVENTS = {
    ("clear", "yellow"): ("ENTERED POOL AREA", False),
    ("clear", "red"): ("RED BOUNDARY CROSSED", True),
    ("clear", "orange"): ("DEEP POOL ENTRY", True),
    ("yellow", "red"): ("RED BOUNDARY CROSSED", True),
    ("yellow", "orange"): ("DEEP POOL ENTRY", True),
    ("red", "orange"): ("DEEP POOL ENTRY", True),
    ("orange", "red"): ("LEFT DEEP POOL", False),
    ("orange", "yellow"): ("LEFT DEEP POOL", False),
    ("orange", "clear"): ("LEFT POOL AREA", False),
    ("red", "yellow"): ("LEFT RED ZONE", False),
    ("red", "clear"): ("LEFT POOL AREA", False),
    ("yellow", "clear"): ("LEFT POOL AREA", False),
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


def calculate_person_distances(people, frame_width=1920, pool_real_width_m=15.0, calibrator: SpatialCalibrator | None = None):
    """Calculate pairwise distances between all pairs of people in real-world meters."""
    distances = []
    for i, p1 in enumerate(people):
        for j, p2 in enumerate(people):
            if i >= j:
                continue
            fx1, fy1 = p1['foot']
            fx2, fy2 = p2['foot']
            if calibrator is not None:
                dist_m = calibrator.calculate_distance((fx1, fy1), (fx2, fy2))
            else:
                dist_px = math.hypot(fx2 - fx1, fy2 - fy1)
                dist_m = pixels_to_meters(dist_px, frame_width, pool_real_width_m)
            distances.append({
                'person1': p1['id'],
                'person2': p2['id'],
                'distance_m': dist_m
            })
    return distances


def classify_person_role(
    person: dict,
    calibrator: SpatialCalibrator | None,
    supervision_cfg: dict,
) -> tuple[str, bool, float, float]:
    """
    Classify person as 'adult' (authorized supervisor/guardian) or 'child' (individual requiring supervision).
    Returns (role, is_supervisor, adult_confidence, child_confidence).
    """
    track_id = person.get("id")
    authorized_ids = supervision_cfg.get("authorized_supervisor_ids") or []
    if track_id is not None and track_id in authorized_ids:
        return "adult", True, 1.0, 0.0

    if person.get("role") in ("adult", "supervisor", "guardian"):
        adult_conf = float(person.get("adult_confidence", 0.95))
        return "adult", True, adult_conf, round(1.0 - adult_conf, 2)
    if person.get("role") in ("child", "individual"):
        child_conf = float(person.get("child_confidence", 0.95))
        return "child", False, round(1.0 - child_conf, 2), child_conf

    xyxy = person.get("xyxy")
    foot = person.get("foot") or (0.0, 0.0)
    est_height_m = None
    if xyxy is not None and calibrator is not None:
        est_height_m = calibrator.estimate_person_height_m(xyxy, foot)

    adult_thresh_m = float(supervision_cfg.get("adult_height_threshold_m", 1.40))
    conf_thresh = float(supervision_cfg.get("adult_confidence_threshold", 0.55))

    scores = []
    if est_height_m is not None:
        diff = (est_height_m - adult_thresh_m) / 0.15
        h_score = 1.0 / (1.0 + math.exp(-max(-5.0, min(5.0, diff))))
        scores.append(h_score)

    if xyxy is not None:
        w_box = max(1.0, xyxy[2] - xyxy[0])
        h_box = max(1.0, xyxy[3] - xyxy[1])
        aspect = h_box / w_box
        aspect_score = 1.0 / (1.0 + math.exp(-max(-5.0, min(5.0, (aspect - 2.5) * 1.5))))
        scores.append(aspect_score)

    adult_confidence = float(np.mean(scores)) if scores else 0.5
    child_confidence = float(1.0 - adult_confidence)
    is_adult = adult_confidence >= conf_thresh
    role = "adult" if is_adult else "child"
    is_supervisor = is_adult

    return role, is_supervisor, round(adult_confidence, 2), round(child_confidence, 2)


def check_supervision(people, supervision_cfg, frame_width_or_calibrator):
    """
    Check if individuals in pool zones have supervision within 0.7-meter radius of an authorized supervisor.
    
    Proximity Threshold Requirement:
    - An individual is classified as 'supervised' ONLY IF they are within a 0.7-meter radius of an
      authorized supervisor/guardian.
    - If distance exceeds 0.7 meters (or no authorized supervisor is present), they MUST be flagged
      as 'unsupervised'.
    - Non-supervisors near each other do NOT supervise each other.
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
    check_zones = supervision_cfg.get('check_zones', ['yellow', 'red', 'orange'])
    supervisor_zones = supervision_cfg.get('supervisor_zones', ['clear', 'yellow', 'red', 'orange'])
    supervisor_role_required = bool(supervision_cfg.get('supervisor_role_required', True))

    # Classify all people and attach roles and metric ground coordinates
    for p in people:
        role, is_sup, a_conf, c_conf = classify_person_role(p, calibrator, supervision_cfg)
        p['role'] = role
        p['is_supervisor'] = is_sup
        p['adult_confidence'] = a_conf
        p['child_confidence'] = c_conf
        foot = p.get('foot', (0.0, 0.0))
        p['metric_pos'] = calibrator.pixel_to_metric(foot[0], foot[1])

    if supervisor_role_required:
        supervisors = [p for p in people if p.get('is_supervisor', False) and p['zone'] in supervisor_zones]
    else:
        supervisors = [p for p in people if p['zone'] in supervisor_zones]

    people_in_pool = [p for p in people if p['zone'] in check_zones]
    unsupervised = []

    for person in people_in_pool:
        # Adults/supervisors in pool are self-supervised
        if person.get('is_supervisor', False):
            person['supervised'] = True
            person['supervision_data'] = {
                'supervised': True,
                'role': person.get('role', 'adult'),
                'separation_distance': 0.0,
                'supervision_threshold': threshold,
                'nearest_person_id': person['id'],
                'supervisor_id': person['id'],
                'adult_confidence': person.get('adult_confidence', 1.0),
                'child_confidence': person.get('child_confidence', 0.0),
                'boundary_direction': 'supervisor_presence',
            }
            continue

        # Individual requiring supervision: calculate precise distance to nearest authorized supervisor
        nearest_distance = float('inf')
        nearest_supervisor_id = None

        for sup in supervisors:
            if sup['id'] == person['id']:
                continue
            dist_m = calibrator.calculate_distance(person['foot'], sup['foot'])
            if dist_m < nearest_distance:
                nearest_distance = dist_m
                nearest_supervisor_id = sup['id']

        # Proximity Threshold: Classified as 'supervised' ONLY IF within 0.7-meter radius of supervisor
        has_supervision = (nearest_distance <= threshold)

        person['supervised'] = has_supervision
        sep_dist = round(nearest_distance, 2) if nearest_distance != float('inf') else None
        person['supervision_data'] = {
            'supervised': has_supervision,
            'role': person.get('role', 'child'),
            'separation_distance': sep_dist,
            'supervision_threshold': threshold,
            'nearest_person_id': nearest_supervisor_id,
            'supervisor_id': nearest_supervisor_id,
            'adult_confidence': person.get('adult_confidence', 0.0),
            'child_confidence': person.get('child_confidence', 1.0),
            'boundary_direction': 'toward_pool' if not has_supervision else 'monitored',
        }

        if not has_supervision:
            unsupervised.append(person)
    return unsupervised


def polygon_contains_points(outer, pts) -> bool:
    return all(point_in_polygon(x, y, outer) for x, y in pts)


def validate_nesting(zcfg) -> list[str]:
    """orange ⊂ red ⊂ yellow using vertices in the config's own coordinate space."""
    warnings = []
    yellow = zcfg["yellow"].get("points") or []
    red = zcfg["red"].get("points") or []
    orange = zcfg["orange"].get("points") or []
    if len(yellow) >= 3 and len(red) >= 3 and not polygon_contains_points(yellow, red):
        warnings.append("red is not fully inside yellow (orange ⊂ red ⊂ yellow)")
    if len(red) >= 3 and len(orange) >= 2 and not polygon_contains_points(red, orange):
        warnings.append("orange is not fully inside red (orange ⊂ red ⊂ yellow)")
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
    in_yellow = zones_px["yellow"]["enabled"] and point_in_polygon(
        x, y, zones_px["yellow"]["points"]
    )
    in_red = (
        in_yellow
        and zones_px["red"]["enabled"]
        and point_in_polygon(x, y, zones_px["red"]["points"])
    )
    in_orange = in_red and in_orange_shape(x, y, zones_px["orange"], orange_proximity_px)
    if in_orange:
        return "orange"
    if in_red:
        return "red"
    if in_yellow:
        return "yellow"
    return "clear"


def crossing_event(prev_zone, zone):
    if prev_zone is None or prev_zone == zone:
        return None, False
    return CROSSING_EVENTS.get((prev_zone, zone), (None, False))


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
    
    # Supervision & anti-jitter fields
    role: str = "child"
    is_supervisor: bool = False
    adult_confidence: float = 0.5
    child_confidence: float = 0.5
    supervised: bool = True
    pending_state: bool | None = None
    pending_frames: int = 0
    smoothed_distance: float | None = None
    nearest_supervisor_id: int | None = None
    last_supervisor_seen_time: float = 0.0
    last_supervision_check: float = 0.0
    consecutive_occluded_frames: int = 0
    supervision_history: list = field(default_factory=list)


@dataclass
class PersonTracker:
    cooldown_sec: float = 3.0
    lost_sec: float = 2.0
    supervision_cooldown_sec: float = 10.0
    unsupervised_confirm_frames: int = 4
    supervised_confirm_frames: int = 3
    hysteresis_margin_meters: float = 0.05
    occlusion_grace_sec: float = 1.2
    distance_smoothing_alpha: float = 0.5
    states: dict[int, PersonState] = field(default_factory=dict)

    def prune(self, now: float):
        dead = [i for i, s in self.states.items() if now - s.last_seen > self.lost_sec]
        for i in dead:
            del self.states[i]

    def update(self, track_id: int, zone: str, foot, now: float):
        st = self.states.get(track_id)
        if st is None:
            prev = "clear"
            st = PersonState(id=track_id, zone=prev, prev_zone=prev, last_seen=now)
            self.states[track_id] = st
        else:
            prev = st.zone

        event, is_alert = crossing_event(prev, zone)
        # Suppress repeats of the same crossing (alerts and info) while in cooldown
        if event and st.last_event == event and (now - st.last_event_time) < self.cooldown_sec:
            event, is_alert = None, False

        st.prev_zone = prev
        st.zone = zone
        st.foot = (float(foot[0]), float(foot[1]))
        st.last_seen = now
        if event:
            st.last_event = event
            st.last_event_time = now
            if is_alert:
                st.last_alert_key = event
        return st, event, is_alert

    def update_supervision(self, people, supervision_cfg, frame_width_or_calibrator, now: float):
        """
        Update supervision status for all people with anti-jitter debouncing,
        hysteresis, occlusion grace periods, and continuous status change logging.
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
        hysteresis_margin = float(supervision_cfg.get('hysteresis_margin_meters', self.hysteresis_margin_meters))
        unsupervised_confirm_frames = int(supervision_cfg.get('unsupervised_confirm_frames', self.unsupervised_confirm_frames))
        supervised_confirm_frames = int(supervision_cfg.get('supervised_confirm_frames', self.supervised_confirm_frames))
        occlusion_grace_sec = float(supervision_cfg.get('occlusion_grace_sec', self.occlusion_grace_sec))
        alpha = float(supervision_cfg.get('distance_smoothing_alpha', self.distance_smoothing_alpha))

        unsupervised = check_supervision(people, supervision_cfg, calibrator)
        unsupervised_ids = {p['id'] for p in unsupervised}

        events = []
        for person in people:
            pid = person['id']
            st = self.states.get(pid)
            if not st:
                # Auto-register: person detected in zone but no state entry yet
                # (happens when update_supervision is called before a zone crossing event)
                check_zones_inner = supervision_cfg.get('check_zones', ['yellow', 'red', 'orange'])
                if person.get('zone') not in check_zones_inner:
                    continue
                st = PersonState(
                    id=pid,
                    zone=person.get('zone', 'clear'),
                    prev_zone='clear',
                    last_seen=now,
                    # Start unsupervised-pending so solo detection fires quickly
                    supervised=True,
                    last_supervisor_seen_time=0.0,
                    last_supervision_check=now,
                )
                self.states[pid] = st

            st.role = person.get('role', 'child')
            st.is_supervisor = bool(person.get('is_supervisor', False))
            st.adult_confidence = float(person.get('adult_confidence', 0.5))
            st.child_confidence = float(person.get('child_confidence', 0.5))

            # Adults/supervisors in pool are self-supervised
            if st.is_supervisor:
                st.supervised = True
                st.pending_state = None
                st.pending_frames = 0
                st.smoothed_distance = 0.0
                st.last_supervisor_seen_time = now
                continue

            # Outside pool zones, person is safe
            check_zones = supervision_cfg.get('check_zones', ['yellow', 'red', 'orange'])
            if person['zone'] not in check_zones:
                st.supervised = True
                st.pending_state = None
                st.pending_frames = 0
                continue

            sup_data = person.get('supervision_data', {})
            raw_dist = sup_data.get('separation_distance')
            # check_supervision writes 'supervisor_id'; fall back to 'nearest_supervisor_id'
            nearest_sup_id = sup_data.get('supervisor_id') or sup_data.get('nearest_supervisor_id')
            st.nearest_supervisor_id = nearest_sup_id

            # If no supervisors exist at all (not just occluded), treat as provably unsupervised
            # immediately — no grace period applies since there is no supervisor to be occluded.
            no_supervisors_at_all = not any(
                p.get('is_supervisor', False) for p in people if p['id'] != pid
            )
            if no_supervisors_at_all and person['zone'] in supervision_cfg.get('check_zones', ['yellow', 'red', 'orange']):
                raw_dist = None   # No supervisor → infinite distance
                nearest_sup_id = None
                # Skip occlusion grace — there's no supervisor who could be occluded
                st.consecutive_occluded_frames = 0

            # Exponential Moving Average distance smoothing
            if raw_dist is not None:
                if st.smoothed_distance is None:
                    st.smoothed_distance = raw_dist
                else:
                    st.smoothed_distance = alpha * raw_dist + (1.0 - alpha) * st.smoothed_distance
                effective_dist = st.smoothed_distance
            else:
                effective_dist = float('inf')

            # Occlusion handling
            is_occluded = (raw_dist is None or nearest_sup_id is None) and st.supervised
            time_since_sup_seen = now - st.last_supervisor_seen_time

            if is_occluded and time_since_sup_seen < occlusion_grace_sec:
                st.consecutive_occluded_frames += 1
                continue
            elif not is_occluded:
                st.consecutive_occluded_frames = 0

            # Candidate state evaluation with hysteresis margin
            # To become UNSUPERVISED: distance must exceed (threshold + margin) or supervisor gone past grace
            # To become SUPERVISED: distance must be <= threshold
            check_dist = raw_dist if raw_dist is not None else float('inf')
            if st.supervised:
                candidate = False if (check_dist > (threshold + hysteresis_margin) or (raw_dist is None and time_since_sup_seen >= occlusion_grace_sec)) else True
            else:
                candidate = True if (check_dist <= threshold and raw_dist is not None) else False

            if candidate:
                st.last_supervisor_seen_time = now
                if not st.supervised and raw_dist is not None:
                    # Snap smoothed distance towards supervisor's current position on return
                    st.smoothed_distance = raw_dist

            # Debouncing: Require N consecutive frames in candidate state before state transition
            if candidate != st.supervised:
                if st.pending_state == candidate:
                    st.pending_frames += 1
                else:
                    st.pending_state = candidate
                    st.pending_frames = 1

                required_frames = supervised_confirm_frames if candidate else unsupervised_confirm_frames
                if st.pending_frames >= required_frames:
                    was_supervised = st.supervised
                    st.supervised = candidate
                    st.pending_state = None
                    st.pending_frames = 0
                    st.last_supervision_check = now

                    log_entry = {
                        'from': 'SUPERVISED' if was_supervised else 'UNSUPERVISED',
                        'to': 'SUPERVISED' if candidate else 'UNSUPERVISED',
                        'time': now,
                        'distance_m': round(effective_dist, 2) if effective_dist != float('inf') else None,
                        'supervisor_id': nearest_sup_id,
                        'zone': person['zone'],
                    }
                    st.supervision_history.append(log_entry)

                    if not candidate:
                        # Transitioned to UNSUPERVISED
                        events.append({
                            'id': pid,
                            'zone': person['zone'],
                            'event': 'UNSUPERVISED',
                            'is_alert': True,
                            'supervision_data': {
                                'supervised': False,
                                'role': st.role,
                                'separation_distance': round(effective_dist, 2) if effective_dist != float('inf') else None,
                                'supervision_threshold': threshold,
                                'nearest_person_id': nearest_sup_id,
                                'supervisor_id': nearest_sup_id,
                                'adult_confidence': st.adult_confidence,
                                'child_confidence': st.child_confidence,
                                'boundary_direction': 'toward_pool',
                            }
                        })
                    else:
                        # Transitioned to SUPERVISED
                        events.append({
                            'id': pid,
                            'zone': person['zone'],
                            'event': 'SUPERVISED',
                            'is_alert': False,
                            'supervision_data': {
                                'supervised': True,
                                'role': st.role,
                                'separation_distance': round(effective_dist, 2),
                                'supervision_threshold': threshold,
                                'nearest_person_id': nearest_sup_id,
                                'supervisor_id': nearest_sup_id,
                                'adult_confidence': st.adult_confidence,
                                'child_confidence': st.child_confidence,
                                'boundary_direction': 'supervised',
                            }
                        })
            else:
                st.pending_state = None
                st.pending_frames = 0

                # Periodic reminder if still unsupervised in danger zone
                if not st.supervised and (now - st.last_supervision_check) > self.supervision_cooldown_sec:
                    st.last_supervision_check = now
                    events.append({
                        'id': pid,
                        'zone': person['zone'],
                        'event': 'UNSUPERVISED',
                        'is_alert': True,
                        'supervision_data': {
                            'supervised': False,
                            'role': st.role,
                            'separation_distance': round(effective_dist, 2) if effective_dist != float('inf') else None,
                            'supervision_threshold': threshold,
                            'nearest_person_id': nearest_sup_id,
                            'supervisor_id': nearest_sup_id,
                            'adult_confidence': st.adult_confidence,
                            'child_confidence': st.child_confidence,
                            'boundary_direction': 'toward_pool',
                        }
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


def draw_skeleton(frame, kxy, kcf, kpt_conf):
    if kxy is None:
        return
    for a, b in SKELETON:
        xa, ya = float(kxy[a][0]), float(kxy[a][1])
        xb, yb = float(kxy[b][0]), float(kxy[b][1])
        ca = float(kcf[a]) if kcf is not None else 1.0
        cb = float(kcf[b]) if kcf is not None else 1.0
        if min(xa, ya, xb, yb) <= 1:
            continue
        if ca < kpt_conf or cb < kpt_conf:
            continue
        cv2.line(frame, (int(xa), int(ya)), (int(xb), int(yb)), COLORS["bone"], 2)


def draw_supervision_overlay(frame, people, calibrator: SpatialCalibrator | None = None, threshold_m: float = 0.7):
    """
    Render visual supervision overlays on CCTV frame:
    1. 0.7m projected ground-plane circle/ellipse around supervisors.
    2. Proximity lines between individuals and nearest supervisors with distance badges.
    """
    for p in people:
        foot = p.get('foot')
        if not foot:
            continue
        fx, fy = int(foot[0]), int(foot[1])
        if p.get('is_supervisor', False) and calibrator is not None:
            try:
                circle_pts = calibrator.get_proximity_circle_pixels((fx, fy), radius_m=threshold_m, num_points=32)
                pts_arr = np.array(circle_pts, dtype=np.int32).reshape((-1, 1, 2))
                bubble_overlay = frame.copy()
                cv2.fillPoly(bubble_overlay, [pts_arr], (110, 156, 27))
                cv2.addWeighted(bubble_overlay, 0.15, frame, 0.85, 0, frame)
                cv2.polylines(frame, [pts_arr], isClosed=True, color=(110, 156, 27), thickness=2, lineType=cv2.LINE_AA)
            except Exception:
                pass

    for p in people:
        if p.get('is_supervisor', False):
            continue
        sup_data = p.get('supervision_data', {})
        sup_id = sup_data.get('nearest_supervisor_id')
        sep_dist = sup_data.get('separation_distance')
        if sup_id is not None and sep_dist is not None:
            sup = next((s for s in people if s['id'] == sup_id), None)
            if sup and sup.get('foot') and p.get('foot'):
                cx, cy = int(p['foot'][0]), int(p['foot'][1])
                sx, sy = int(sup['foot'][0]), int(sup['foot'][1])
                is_sup = sup_data.get('supervised', False)
                line_color = (110, 156, 27) if is_sup else (74, 54, 214)
                cv2.line(frame, (cx, cy), (sx, sy), line_color, 2, cv2.LINE_AA)
                mx, my = (cx + sx) // 2, (cy + sy) // 2
                badge_txt = f"{sep_dist:.2f}m" + (" [OK]" if is_sup else " [OVER 0.7m]")
                (bw, bh), _ = cv2.getTextSize(badge_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                cv2.rectangle(frame, (mx - bw//2 - 4, my - bh - 4), (mx + bw//2 + 4, my + 4), (0, 0, 0), -1)
                cv2.rectangle(frame, (mx - bw//2 - 4, my - bh - 4), (mx + bw//2 + 4, my + 4), line_color, 1)
                cv2.putText(frame, badge_txt, (mx - bw//2, my - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)


def draw_person(frame, track_id, xyxy, foot, src, left, right, kxy, kcf, kpt_conf, zone, event, supervision_data: dict | None = None):
    x1, y1, x2, y2 = (int(v) for v in xyxy)
    
    is_sup = supervision_data.get('is_supervisor', False) if supervision_data else False
    supervised = supervision_data.get('supervised', True) if supervision_data else True
    role = supervision_data.get('role') if supervision_data else None

    if is_sup:
        color = COLORS["adult"]
    elif role == "child" or not supervised:
        color = COLORS["supervised"] if supervised else COLORS["unsupervised"]
    else:
        color = COLORS[BOX_COLOR.get(zone, "clear")]

    draw_skeleton(frame, kxy, kcf, kpt_conf)
    if left:
        cv2.circle(frame, (int(left[0]), int(left[1])), 5, COLORS["ankle_l"], -1)
    if right:
        cv2.circle(frame, (int(right[0]), int(right[1])), 5, COLORS["ankle_r"], -1)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    fx, fy = int(foot[0]), int(foot[1])
    cv2.circle(frame, (fx, fy), 7, COLORS["foot"], -1)
    cv2.circle(frame, (fx, fy), 9, color, 2)
    
    event_txt = event or "-"
    if is_sup:
        a_conf = supervision_data.get('adult_confidence', 1.0)
        label = f"SUPERVISOR #{track_id} | Adult:{a_conf:.2f} | Zone: {ZONE_LABEL.get(zone, zone)}"
    elif role == "child" or (supervision_data and not is_sup):
        status_txt = "SUPERVISED" if supervised else "UNSUPERVISED"
        sep = supervision_data.get('separation_distance')
        sep_str = f" {sep:.2f}m" if sep is not None else " No Sup"
        label = f"CHILD #{track_id} | {status_txt}{sep_str} | Zone: {ZONE_LABEL.get(zone, zone)}"
    else:
        label = f"Person #{track_id} | Zone: {ZONE_LABEL.get(zone, zone)} | Event: {event_txt}"

    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
    ty = max(th + 8, y1 - 8)
    cv2.rectangle(frame, (x1, ty - th - 6), (x1 + tw + 8, ty + 4), (0, 0, 0), -1)
    cv2.putText(
        frame, label, (x1 + 4, ty),
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA,
    )
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


def people_from_result(result):
    if result.boxes is None or len(result.boxes) == 0:
        return
    n = len(result.boxes)
    xyxy = result.boxes.xyxy.cpu().numpy()
    if result.boxes.id is not None:
        ids = result.boxes.id.cpu().numpy().astype(int)
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


def process_result(result, zcfg, tracker: PersonTracker, kpt_conf, persist: bool):
    frame = result.orig_img.copy()
    h, w = frame.shape[:2]
    zones_px = zone_pixels(zcfg, w, h)
    orange_px = zcfg.get("orange_proximity", 0.02) * w
    now = time.time()
    if persist:
        tracker.prune(now)

    draw_zones(frame, zones_px)
    reports = []
    for track_id, xyxy, kxy, kcf in people_from_result(result):
        fx, fy, src, left, right = foot_point(xyxy, kxy, kcf, kpt_conf)
        zone = classify_zone(fx, fy, zones_px, orange_px)
        if persist:
            st, event, is_alert = tracker.update(track_id, zone, (fx, fy), now)
        else:
            event, is_alert = None, False
            st = None
        draw_person(frame, track_id, xyxy, (fx, fy), src, left, right, kxy, kcf, kpt_conf, zone, event)
        reports.append({
            "id": track_id,
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
    check("orange ⊂ red", polygon_contains_points(red, orange))
    check("orange not ⊂ too-small red", not polygon_contains_points([(0, 0), (10, 0), (10, 10), (0, 10)], orange))

    zcfg = {
        "yellow": {"enabled": True, "points": yellow, "geometry": "polygon"},
        "red": {"enabled": True, "points": red, "geometry": "polygon"},
        "orange": {"enabled": True, "points": orange, "geometry": "polygon"},
    }
    check("point in yellow only", classify_zone(10, 10, zcfg, 1) == "yellow")
    check("point in red", classify_zone(30, 30, zcfg, 1) == "red")
    check("point in orange", classify_zone(50, 50, zcfg, 1) == "orange")
    check("point outside", classify_zone(200, 200, zcfg, 1) == "clear")

    ev, alert = crossing_event("clear", "yellow")
    check("OUTSIDE→YELLOW monitor", ev == "ENTERED POOL AREA" and alert is False)
    ev, alert = crossing_event("yellow", "red")
    check("YELLOW→RED alert", ev == "RED BOUNDARY CROSSED" and alert is True)
    ev, alert = crossing_event("red", "orange")
    check("RED→ORANGE deep pool", ev == "DEEP POOL ENTRY" and alert is True)
    ev, alert = crossing_event("orange", "red")
    check("ORANGE→RED no deep alert", ev == "LEFT DEEP POOL" and alert is False)
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
        "supervisor_role_required": True,
        "unsupervised_confirm_frames": 4,
        "supervised_confirm_frames": 3,
        "hysteresis_margin_meters": 0.05,
        "occlusion_grace_sec": 1.2,
        "distance_smoothing_alpha": 0.5,
    }

    # Check 2: Individual within 0.7m of authorized adult supervisor -> SUPERVISED
    p_adult = {
        "id": 10,
        "foot": pt1_px,
        "zone": "yellow",
        "role": "adult",
        "adult_confidence": 0.95,
        "xyxy": [100, 100, 150, 220],
    }
    p_child_near = {
        "id": 20,
        "foot": pt2_px,  # 0.65m from adult
        "zone": "yellow",
        "role": "child",
        "child_confidence": 0.95,
        "xyxy": [150, 120, 180, 180],
    }
    unsupervised_res = check_supervision([p_adult, p_child_near], sup_cfg, cal)
    check("child <= 0.7m from adult is supervised", p_child_near.get("supervised") is True and len(unsupervised_res) == 0)

    # Check 3: Individual > 0.7m from supervisor -> UNSUPERVISED
    p_child_far = {
        "id": 21,
        "foot": pt3_px,  # 0.85m from adult
        "zone": "yellow",
        "role": "child",
        "child_confidence": 0.95,
        "xyxy": [150, 120, 180, 180],
    }
    unsupervised_res2 = check_supervision([p_adult, p_child_far], sup_cfg, cal)
    check("child > 0.7m from adult is unsupervised", p_child_far.get("supervised") is False and len(unsupervised_res2) == 1)

    # Check 4: Two children at 0.4m from each other without an adult -> BOTH UNSUPERVISED
    pt_c1 = cal.metric_to_pixel(8.0, 12.0)
    pt_c2 = cal.metric_to_pixel(8.0, 12.4)  # 0.4m apart
    c1 = {"id": 31, "foot": pt_c1, "zone": "yellow", "role": "child", "child_confidence": 0.9}
    c2 = {"id": 32, "foot": pt_c2, "zone": "yellow", "role": "child", "child_confidence": 0.9}
    unsupervised_kids = check_supervision([c1, c2], sup_cfg, cal)
    check("two kids near each other without supervisor are both unsupervised", len(unsupervised_kids) == 2 and c1.get("supervised") is False and c2.get("supervised") is False)

    # Check 5: Anti-Jitter Debouncing: 1-frame distance spike does NOT flip state to UNSUPERVISED
    tracker_debounce = PersonTracker(unsupervised_confirm_frames=4, supervised_confirm_frames=3)
    t_start = time.time()
    # Establish person states
    tracker_debounce.update(10, "yellow", pt1_px, t_start)
    tracker_debounce.update(20, "yellow", pt2_px, t_start)
    # Frame 1: child at 0.65m (confirmed supervised)
    ev_f1 = tracker_debounce.update_supervision([p_adult, p_child_near], sup_cfg, cal, t_start)
    check("stable initial state supervised", tracker_debounce.states[20].supervised is True)
    # Frame 2: 1-frame spike to 0.85m (> 0.7m)
    p_child_spike = dict(p_child_near, foot=pt3_px)
    ev_spike = tracker_debounce.update_supervision([p_adult, p_child_spike], sup_cfg, cal, t_start + 0.1)
    check("1-frame spike does NOT emit UNSUPERVISED alert", len(ev_spike) == 0 and tracker_debounce.states[20].supervised is True)
    # Frame 3: returns to 0.65m
    tracker_debounce.update_supervision([p_adult, p_child_near], sup_cfg, cal, t_start + 0.2)
    check("spike discarded, state remains supervised", tracker_debounce.states[20].supervised is True)

    # Check 6: Temporary Occlusion: supervisor dropped for 0.4s (< 1.2s grace) does NOT flip state
    ev_occ = tracker_debounce.update_supervision([p_child_near], sup_cfg, cal, t_start + 0.5)
    check("temporary occlusion within grace period does not emit alert", len(ev_occ) == 0 and tracker_debounce.states[20].supervised is True)

    # Check 7: Sustained Separation (> 4 frames) confirms transition to UNSUPERVISED
    for frame_idx in range(4):
        p_child_sustained = dict(p_child_near, foot=pt3_px)
        ev_sustained = tracker_debounce.update_supervision([p_adult, p_child_sustained], sup_cfg, cal, t_start + 2.0 + frame_idx * 0.1)
    check("sustained separation triggers UNSUPERVISED alert", tracker_debounce.states[20].supervised is False and any(e.get("event") == "UNSUPERVISED" for e in ev_sustained))

    # Check 8: Supervisor returns (3 frames <= 0.7m) confirms transition to SUPERVISED
    for frame_idx in range(3):
        ev_return = tracker_debounce.update_supervision([p_adult, p_child_near], sup_cfg, cal, t_start + 3.0 + frame_idx * 0.1)
    check("supervisor return confirms transition to SUPERVISED", tracker_debounce.states[20].supervised is True and any(e.get("event") == "SUPERVISED" for e in ev_return))

    # Check 9: Solo person (no supervisor in frame at all) → UNSUPERVISED after confirm frames
    tracker_solo = PersonTracker(unsupervised_confirm_frames=4, supervised_confirm_frames=3)
    t_solo = time.time() + 100.0
    tracker_solo.update(99, "yellow", pt2_px, t_solo)
    p_solo = {'id': 99, 'foot': pt2_px, 'zone': 'yellow', 'xyxy': None}
    ev_solo_early = tracker_solo.update_supervision([p_solo], sup_cfg, cal, t_solo)
    check("solo person: no alert before confirm frames", len(ev_solo_early) == 0)
    # Run 4 consecutive frames and accumulate all events emitted
    all_solo_events = []
    for fi in range(4):
        all_solo_events += tracker_solo.update_supervision([p_solo], sup_cfg, cal, t_solo + fi * 0.1 + 0.05)
    check("solo person in pool zone flagged UNSUPERVISED after confirm frames",
          tracker_solo.states[99].supervised is False and
          any(e.get("event") == "UNSUPERVISED" for e in all_solo_events))


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
    conf = args.conf if args.conf is not None else float(
        pose_cfg.get("confidence_threshold", zcfg.get("confidence_threshold", 0.25))
    )
    kpt_conf = float(pose_cfg.get("keypoint_confidence", zcfg.get("keypoint_confidence", 0.3)))
    rtsp_url = camera_cfg.get("rtsp_url")
    source, kind = resolve_source(args.source, rtsp_url)

    for warn in validate_nesting(zcfg):
        print(f"[zone] WARN {warn}")

    print(f"[zone] config {args.config}")
    print(f"[zone] model={model_name} (dataset/person_pose is not used)")
    print(f"[zone] coord_space={zcfg.get('coord_space')} editor_size={zcfg.get('editor_size')}")
    print("[zone] nested Yellow ⊃ Red ⊃ Orange | drowning stays in pose_logic.py")
    print(f"[zone] source={source if kind != 'stream' else 'rtsp stream'}")
    model = YOLO(model_name)

    show = (args.show or kind in {"stream", "video"}) and not args.no_show
    save = args.save or kind in {"image", "folder"}
    if save:
        OUT_DIR.mkdir(parents=True, exist_ok=True)

    use_track = kind in {"stream", "video"}
    if use_track:
        results = model.track(source=source, conf=conf, persist=True, stream=True, verbose=False)
    else:
        results = model.predict(source=source, conf=conf, stream=True, verbose=False)

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
            frame, reports = process_result(result, zcfg, tracker, kpt_conf, persist=use_track)
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
