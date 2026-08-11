

import argparse
import shutil
import sys
import zipfile
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DATASET_ROOT = REPO_ROOT / "dataset"
IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp"}
SPLITS = ("train", "val", "test")


def load_yaml(task: str) -> dict:
    yaml_path = DATASET_ROOT / task / "dataset.yaml"
    if not yaml_path.exists():
        sys.exit(f"[error] no dataset.yaml found at {yaml_path}")
    with open(yaml_path) as f:
        return yaml.safe_load(f)


# --------------------------------------------------------------------------- #
# INGEST
# --------------------------------------------------------------------------- #

def _extract_if_zip(source: Path, tmp_dir: Path) -> Path:
    if source.is_dir():
        return source
    if source.suffix.lower() == ".zip":
        print(f"[ingest] unzipping {source.name} ...")
        with zipfile.ZipFile(source) as zf:
            zf.extractall(tmp_dir)
        return tmp_dir
    sys.exit(f"[error] --source must be a directory or a .zip file, got {source}")


def _find_split_dirs(extracted_root: Path) -> dict:
    """
    Roboflow exports commonly look like:
        train/images, train/labels, valid/images, valid/labels, test/images, test/labels
    We normalize 'valid' -> 'val' and locate each split by walking the tree,
    since the exact export layout varies by Roboflow project settings.
    """
    found = {}
    for split_name, aliases in (
        ("train", ("train",)),
        ("val", ("val", "valid", "validation")),
        ("test", ("test",)),
    ):
        for alias in aliases:
            img_dir = next(extracted_root.rglob(f"{alias}/images"), None)
            lbl_dir = next(extracted_root.rglob(f"{alias}/labels"), None)
            if img_dir and lbl_dir:
                found[split_name] = (img_dir, lbl_dir)
                break
    return found


def ingest(task: str, source: Path):
    task_dir = DATASET_ROOT / task
    if not task_dir.exists():
        sys.exit(f"[error] unknown task '{task}', expected a folder at {task_dir}")

    tmp_dir = task_dir / "_ingest_tmp"
    tmp_dir.mkdir(exist_ok=True)
    try:
        extracted_root = _extract_if_zip(source, tmp_dir)
        splits = _find_split_dirs(extracted_root)
        if not splits:
            sys.exit(
                "[error] couldn't find train/val/test images+labels folders in "
                f"{extracted_root}. Check the export was done in a YOLO-pose format."
            )

        for split, (img_src, lbl_src) in splits.items():
            img_dst = task_dir / "images" / split
            lbl_dst = task_dir / "labels" / split
            img_dst.mkdir(parents=True, exist_ok=True)
            lbl_dst.mkdir(parents=True, exist_ok=True)

            n_imgs = 0
            for f in img_src.iterdir():
                if f.suffix.lower() in IMG_EXTS:
                    shutil.copy2(f, img_dst / f.name)
                    n_imgs += 1
            n_lbls = 0
            for f in lbl_src.iterdir():
                if f.suffix.lower() == ".txt":
                    shutil.copy2(f, lbl_dst / f.name)
                    n_lbls += 1

            print(f"[ingest] {split}: copied {n_imgs} images, {n_lbls} labels -> {img_dst.parent}")

        # Roboflow also exports its own data.yaml - we intentionally do NOT
        # overwrite this repo's dataset.yaml with it, since paths/class order
        # need to match what the rest of the app expects. Copy it alongside
        # for reference only.
        rf_yaml = next(extracted_root.rglob("data.yaml"), None)
        if rf_yaml:
            shutil.copy2(rf_yaml, task_dir / "roboflow_export_data.yaml")
            print(
                "[ingest] saved Roboflow's own data.yaml as "
                f"{task_dir / 'roboflow_export_data.yaml'} for reference - "
                "compare class order/kpt_shape against dataset.yaml before training."
            )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    print("[ingest] done. Run `validate` next to sanity-check the result.")


# --------------------------------------------------------------------------- #
# VALIDATE
# --------------------------------------------------------------------------- #

def validate(task: str):
    cfg = load_yaml(task)
    kpt_shape = cfg.get("kpt_shape")
    nc = cfg.get("nc")
    names = cfg.get("names", {})
    if not kpt_shape:
        print(
            "[warn] no 'kpt_shape' in dataset.yaml - this dataset is currently "
            "configured for plain detection, not pose. Add kpt_shape: [N, 3] "
            "before pose training."
        )
        n_kpts = None
    else:
        n_kpts = kpt_shape[0]

    expected_cols = None
    if n_kpts is not None:
        expected_cols = 5 + n_kpts * 3  # class cx cy w h + (x y v)*n_kpts

    task_dir = DATASET_ROOT / task
    total_problems = 0
    class_counts = {i: 0 for i in range(nc)} if nc else {}

    for split in SPLITS:
        img_dir = task_dir / "images" / split
        lbl_dir = task_dir / "labels" / split
        if not img_dir.exists():
            print(f"[warn] missing folder: {img_dir}")
            continue

        images = sorted(p for p in img_dir.iterdir() if p.suffix.lower() in IMG_EXTS)
        if not images:
            print(f"[warn] {split}: 0 images found in {img_dir}")
            continue

        missing_labels = 0
        bad_rows = 0
        for img_path in images:
            lbl_path = lbl_dir / (img_path.stem + ".txt")
            if not lbl_path.exists():
                missing_labels += 1
                continue
            for line_no, line in enumerate(lbl_path.read_text().splitlines(), start=1):
                if not line.strip():
                    continue
                cols = line.split()
                cls_id = int(float(cols[0]))
                if nc and cls_id not in class_counts:
                    print(f"[error] {lbl_path}:{line_no} class id {cls_id} outside nc={nc}")
                    bad_rows += 1
                elif nc:
                    class_counts[cls_id] += 1
                if expected_cols and len(cols) != expected_cols:
                    print(
                        f"[error] {lbl_path}:{line_no} has {len(cols)} columns, "
                        f"expected {expected_cols} for kpt_shape={kpt_shape}"
                    )
                    bad_rows += 1

        print(f"[validate] {split}: {len(images)} images, {missing_labels} missing labels, {bad_rows} bad rows")
        total_problems += missing_labels + bad_rows

    print("\n[validate] class balance (train+val+test combined):")
    for cls_id, count in class_counts.items():
        label = names.get(cls_id, f"class_{cls_id}")
        print(f"  {cls_id} ({label}): {count}")

    if total_problems == 0:
        print("\n[validate] no problems found.")
    else:
        print(f"\n[validate] {total_problems} problem(s) found - fix before training.")


# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_ingest = sub.add_parser("ingest", help="copy a Roboflow export into dataset/<task>/{images,labels}")
    p_ingest.add_argument("--source", required=True, type=Path, help="path to Roboflow .zip export or extracted folder")
    p_ingest.add_argument("--task", required=True, choices=["person_pose", "drowning"])

    p_validate = sub.add_parser("validate", help="sanity-check an existing dataset/<task> folder")
    p_validate.add_argument("--task", required=True, choices=["person_pose", "drowning"])

    args = parser.parse_args()
    if args.command == "ingest":
        ingest(args.task, args.source)
    elif args.command == "validate":
        validate(args.task)


if __name__ == "__main__":
    main()