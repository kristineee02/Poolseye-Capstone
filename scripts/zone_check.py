"""
PoolsEye - person pose + geofence intrusion check.

Does not train anything. Uses stock yolo11n-pose (or another .pt) to find
people, then tests a foot point against the three zones in config.json:

  yellow polygon  - warning (not close to the pool)
  red polygon     - critical (closer to the pool)
  orange polyline - deep-pool boundary (near on stills, crossed on video)

Foot point = average of visible ankles (COCO 15/16). If neither ankle is
confident, falls back to the bottom-center of the person box.
If a person hits more than one zone, the highest severity wins:
  critical > boundary > warning > clear

Zone points in scripts/config.json currently match the dashboard geofence
editor template (1000 x 512). Redraw them on your real camera view before
trusting alerts.

Usage
-----
Single image:
    python scripts/zone_check.py --source path/to/frame.jpg

Folder:
    python scripts/zone_check.py --source dataset/person_pose/images/val

Live Tapo stream:
    python scripts/zone_check.py --source rtsp://USER:PASS@IP:554/stream1
"""

from __future__ import annotations

import argparse
import json
import math
import sys
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

# BGR — matches frontend/src/data/geofence.js
COLORS = {
    "yellow": (0, 184, 230),
    "red": (74, 54, 214),
    "orange": (34, 126, 230),
    "foot": (255, 255, 255),
    "clear": (80, 200, 80),
}

SEVERITY_RANK = {
    "clear": 0,
    "warning": 1,
    "boundary": 2,
    "critical": 3,
}

STATUS_TEXT = {
    "clear": "CLEAR",
    "warning": "WARNING",
    "boundary": "BOUNDARY",
    "critical": "CRITICAL",
}


def load_config(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"[error] config not found: {path}")
    with path.open(encoding="utf-8") as f:
        cfg = json.load(f)
    if "ZONES" not in cfg:
        sys.exit(f"[error] no ZONES block in {path}")
    return cfg["ZONES"]


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


def side_of_polyline(x, y, polyline) -> float:
    """Signed side of the first→last chord. Sign flip across frames = a crossing."""
    ax, ay = polyline[0]
    bx, by = polyline[-1]
    return (bx - ax) * (y - ay) - (by - ay) * (x - ax)


def foot_point(xyxy, kxy, kcf, kpt_conf):
    ankles = []
    if kxy is not None:
        for idx in (LEFT_ANKLE, RIGHT_ANKLE):
            x, y = float(kxy[idx][0]), float(kxy[idx][1])
            conf = float(kcf[idx]) if kcf is not None else 1.0
            if x > 1 and y > 1 and conf >= kpt_conf:
                ankles.append((x, y))
        if len(ankles) == 2:
            return (ankles[0][0] + ankles[1][0]) / 2.0, (ankles[0][1] + ankles[1][1]) / 2.0, "ankles"
        if len(ankles) == 1:
            return ankles[0][0], ankles[0][1], "ankle"
    x1, y1, x2, y2 = (float(v) for v in xyxy)
    return (x1 + x2) / 2.0, y2, "bbox"


def classify_foot(x, y, zones_px, orange_proximity_px, prev_side):
    hits = []
    if zones_px["red"]["enabled"] and point_in_polygon(x, y, zones_px["red"]["points"]):
        hits.append("red")
    if zones_px["yellow"]["enabled"] and point_in_polygon(x, y, zones_px["yellow"]["points"]):
        hits.append("yellow")

    orange_near = False
    orange_crossed = False
    side = None
    if zones_px["orange"]["enabled"] and len(zones_px["orange"]["points"]) >= 2:
        d = dist_to_polyline(x, y, zones_px["orange"]["points"])
        orange_near = d <= orange_proximity_px
        side = side_of_polyline(x, y, zones_px["orange"]["points"])
        if prev_side is not None and abs(prev_side) > 1e-3 and abs(side) > 1e-3:
            if (prev_side > 0) != (side > 0):
                orange_crossed = True
        if orange_near or orange_crossed:
            hits.append("orange")

    severity = "clear"
    if "red" in hits:
        severity = "critical"
    elif "orange" in hits:
        severity = "boundary"
    elif "yellow" in hits:
        severity = "warning"

    return {
        "hits": hits,
        "severity": severity,
        "status": STATUS_TEXT[severity],
        "orange_near": orange_near,
        "orange_crossed": orange_crossed,
        "side": side,
    }


def zone_pixels(zcfg, frame_w, frame_h):
    space = zcfg.get("coord_space", "editor")
    editor_size = zcfg.get("editor_size", [1000, 512])
    out = {}
    for key in ("yellow", "red", "orange"):
        block = zcfg[key]
        out[key] = {
            "enabled": bool(block.get("enabled", True)),
            "name": block.get("name", key),
            "points": to_pixel_points(
                block.get("points") or [], frame_w, frame_h, space, editor_size
            ),
        }
    return out


def draw_zones(frame, zones_px):
    overlay = frame.copy()
    for key in ("yellow", "red"):
        if not zones_px[key]["enabled"] or len(zones_px[key]["points"]) < 3:
            continue
        pts = np.array(zones_px[key]["points"], dtype=np.int32)
        cv2.fillPoly(overlay, [pts], COLORS[key])
    frame[:] = cv2.addWeighted(overlay, 0.22, frame, 0.78, 0)
    for key in ("yellow", "red"):
        if not zones_px[key]["enabled"] or len(zones_px[key]["points"]) < 3:
            continue
        pts = np.array(zones_px[key]["points"], dtype=np.int32)
        cv2.polylines(frame, [pts], isClosed=True, color=COLORS[key], thickness=2)
    if zones_px["orange"]["enabled"] and len(zones_px["orange"]["points"]) >= 2:
        pts = np.array(zones_px["orange"]["points"], dtype=np.int32)
        cv2.polylines(frame, [pts], isClosed=False, color=COLORS["orange"], thickness=3)


def draw_person(frame, xyxy, foot, verdict):
    x1, y1, x2, y2 = (int(v) for v in xyxy)
    color = COLORS.get(
        "red" if verdict["severity"] == "critical"
        else "orange" if verdict["severity"] == "boundary"
        else "yellow" if verdict["severity"] == "warning"
        else "clear"
    )
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    fx, fy = int(foot[0]), int(foot[1])
    cv2.circle(frame, (fx, fy), 6, COLORS["foot"], -1)
    cv2.circle(frame, (fx, fy), 8, color, 2)
    label = verdict["status"]
    if verdict["orange_crossed"]:
        label += " CROSSED"
    cv2.putText(
        frame, label, (x1, max(20, y1 - 8)),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2, cv2.LINE_AA,
    )


def resolve_source(source: str):
    if source.lower().startswith("rtsp://"):
        return source, "stream"
    path = Path(source)
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


def process_result(result, zcfg, tracker, kpt_conf, persist_sides):
    frame = result.orig_img.copy()
    h, w = frame.shape[:2]
    zones_px = zone_pixels(zcfg, w, h)
    orange_px = zcfg.get("orange_proximity", 0.02) * w

    draw_zones(frame, zones_px)
    reports = []
    for track_id, xyxy, kxy, kcf in people_from_result(result):
        fx, fy, src = foot_point(xyxy, kxy, kcf, kpt_conf)
        prev_side = tracker.get(track_id) if persist_sides else None
        verdict = classify_foot(fx, fy, zones_px, orange_px, prev_side)
        if persist_sides and verdict["side"] is not None:
            tracker[track_id] = verdict["side"]
        draw_person(frame, xyxy, (fx, fy), verdict)
        reports.append({
            "id": track_id,
            "foot": (round(fx, 1), round(fy, 1)),
            "source": src,
            **verdict,
        })
    return frame, reports


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", required=True, help="image, folder, video, or rtsp:// URL")
    p.add_argument("--model", default="yolo11n-pose.pt")
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    p.add_argument("--conf", type=float, default=None, help="override ZONES.confidence_threshold")
    p.add_argument("--save", action="store_true", help="write annotated images under runs/pose/zone_check/")
    p.add_argument("--show", action="store_true", help="open a preview window (q to quit)")
    args = p.parse_args()

    zcfg = load_config(args.config)
    conf = args.conf if args.conf is not None else float(zcfg.get("confidence_threshold", 0.25))
    kpt_conf = float(zcfg.get("keypoint_confidence", 0.3))
    source, kind = resolve_source(args.source)

    print(f"[zone] config {args.config}")
    print(f"[zone] coord_space={zcfg.get('coord_space')} editor_size={zcfg.get('editor_size')}")
    print("[zone] template polygons from the dashboard editor — redraw on the real camera before trusting alerts")
    print(f"[zone] loading {args.model}")
    model = YOLO(args.model)

    show = args.show or kind in {"stream", "video"}
    save = args.save or kind in {"image", "folder"}
    if save:
        OUT_DIR.mkdir(parents=True, exist_ok=True)

    use_track = kind in {"stream", "video"}
    if use_track:
        results = model.track(source=source, conf=conf, persist=True, stream=True, verbose=False)
    else:
        results = model.predict(source=source, conf=conf, stream=True, verbose=False)

    tracker = {}
    n_frames = 0
    n_people = 0
    n_alert = 0

    try:
        for result in results:
            n_frames += 1
            frame, reports = process_result(result, zcfg, tracker, kpt_conf, persist_sides=use_track)
            n_people += len(reports)
            label = result.path or kind
            if not reports:
                print(f"  {label}: 0 person(s)")
            for r in reports:
                hits = ",".join(r["hits"]) if r["hits"] else "-"
                if r["severity"] != "clear":
                    n_alert += 1
                print(
                    f"  {label}: person {r['id']} {r['status']} "
                    f"hits={hits} foot={r['source']}{r['foot']}"
                )

            if save and kind != "stream":
                name = Path(result.path).name if result.path else f"frame_{n_frames:06d}.jpg"
                cv2.imwrite(str(OUT_DIR / name), frame)
            if show:
                cv2.imshow("PoolsEye - zone check", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    print("[zone] quit")
                    break
    finally:
        if show:
            cv2.destroyAllWindows()

    print(f"\n[zone] frames={n_frames} people={n_people} alerts={n_alert}")
    if save and kind != "stream":
        print(f"[zone] annotated frames saved under {OUT_DIR}")


if __name__ == "__main__":
    main()
