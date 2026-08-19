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
}

ZONE_LABEL = {
    "clear": "OUTSIDE",
    "yellow": "YELLOW",
    "red": "RED",
    "orange": "ORANGE",
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


@dataclass
class PersonTracker:
    cooldown_sec: float = 3.0
    lost_sec: float = 2.0
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
        if event and st.last_alert_key == event and (now - st.last_event_time) < self.cooldown_sec:
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


def draw_person(frame, track_id, xyxy, foot, src, left, right, kxy, kcf, kpt_conf, zone, event):
    x1, y1, x2, y2 = (int(v) for v in xyxy)
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
    label = f"Person #{track_id} | Zone: {ZONE_LABEL[zone]} | Event: {event_txt}"
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
    ty = max(th + 8, y1 - 8)
    cv2.rectangle(frame, (x1, ty - th - 6), (x1 + tw + 8, ty + 4), (0, 0, 0), -1)
    cv2.putText(
        frame, label, (x1 + 4, ty),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA,
    )
    cv2.putText(
        frame, f"foot={src}", (x1, min(frame.shape[0] - 8, y2 + 16)),
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, COLORS["foot"], 1, cv2.LINE_AA,
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
