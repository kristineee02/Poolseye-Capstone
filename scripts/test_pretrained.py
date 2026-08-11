"""
PoolsEye - quick test of the stock COCO-pretrained pose weights.

No training, no labels, no dataset.yaml needed. This is the "test before
you annotate anything" step - run it on a handful of your real pool frames
first to see whether yolo11n-pose.pt already detects people and ankle
keypoints well enough as-is.

Usage
-----
Single image:
    python scripts/test_pretrained.py --source path/to/frame.jpg

Folder of images:
    python scripts/test_pretrained.py --source path/to/frames_folder --model yolo11s-pose.pt

Results (annotated images with boxes + skeleton drawn on) are saved under
runs/pose/predict*/ - open them and eyeball the keypoint quality before
deciding whether you need to fine-tune at all.
"""

import argparse
from pathlib import Path

from ultralytics import YOLO

IMG_EXTS = {
    ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp",
    ".mpo", ".dng", ".jp2", ".heic", ".heif", ".avif",
}


def resolve_source(source: Path):
    """
    model.predict() does NOT recurse into subfolders when given a directory,
    unlike model.train() which does. If images ended up nested (e.g. a whole
    exported 'train' folder got dropped inside images/train instead of just
    its contents), a plain folder path silently finds nothing. Search
    recursively ourselves and hand predict an explicit file list instead.
    """
    if source.is_file():
        return str(source)

    found = sorted(p for p in source.rglob("*") if p.suffix.lower() in IMG_EXTS)
    if not found:
        raise SystemExit(
            f"[error] no images found under {source} (searched recursively).\n"
            "Double check the folder actually contains image files - "
            f"try: dir /s {source}"
        )
    print(f"[test] found {len(found)} image(s) under {source} (recursive search)")
    return [str(p) for p in found]


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", required=True, type=Path, help="image file or folder of images")
    p.add_argument("--model", default="yolo11n-pose.pt", help="which pretrained checkpoint to try (auto-downloads)")
    p.add_argument("--conf", type=float, default=0.25, help="confidence threshold")
    args = p.parse_args()

    if not args.source.exists():
        raise SystemExit(f"[error] source not found: {args.source}")

    print(f"[test] loading {args.model} (auto-downloads on first use)")
    model = YOLO(args.model)

    source = resolve_source(args.source)
    print(f"[test] running on {args.source}")
    results = model.predict(source=source, conf=args.conf, save=True, show_boxes=True)

    for r in results:
        n_people = len(r.boxes) if r.boxes is not None else 0
        print(f"  {r.path}: {n_people} person(s) detected")

    print("\n[test] annotated output images saved under runs/pose/predict*/")
    print("[test] open them and check: are people detected reliably, and are ankle keypoints stable/accurate?")
    print("[test] if yes -> you likely don't need to fine-tune, skip straight to zone_check.py wiring.")
    print("[test] if no  -> proceed with Roboflow annotation + prepare_dataset.py ingest + train_person_pose.py")


if __name__ == "__main__":
    main()