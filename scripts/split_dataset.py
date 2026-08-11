
import argparse
import random
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATASET_ROOT = REPO_ROOT / "dataset"
IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}
SPLITS = ("train", "val", "test")


def collect_unique_images(task_dir: Path) -> dict:
    """Returns {stem: image_path}, deduplicated by filename stem across all splits."""
    unique = {}
    for split in SPLITS:
        img_dir = task_dir / "images" / split
        if not img_dir.exists():
            continue
        for p in img_dir.iterdir():
            if p.suffix.lower() in IMG_EXTS:
                unique[p.stem] = p  # later splits overwrite earlier ones - fine, just dedup by name
    return unique


def find_label(task_dir: Path, stem: str) -> Path | None:
    for split in SPLITS:
        candidate = task_dir / "labels" / split / f"{stem}.txt"
        if candidate.exists():
            return candidate
    return None


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--task", required=True, choices=["person_pose", "drowning"])
    p.add_argument("--train", type=float, default=0.7)
    p.add_argument("--val", type=float, default=0.2)
    p.add_argument("--test", type=float, default=0.1)
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    ratio_sum = args.train + args.val + args.test
    if abs(ratio_sum - 1.0) > 1e-6:
        sys.exit(f"[error] --train/--val/--test must sum to 1.0, got {ratio_sum}")

    task_dir = DATASET_ROOT / args.task
    if not task_dir.exists():
        sys.exit(f"[error] no such dataset folder: {task_dir}")

    unique_images = collect_unique_images(task_dir)
    if not unique_images:
        sys.exit(f"[error] no images found anywhere under {task_dir / 'images'}")

    stems = list(unique_images.keys())
    random.seed(args.seed)
    random.shuffle(stems)

    n = len(stems)
    n_train = int(n * args.train)
    n_val = int(n * args.val)
    # remainder goes to test, so rounding doesn't drop images
    split_assignment = (
        [("train", s) for s in stems[:n_train]]
        + [("val", s) for s in stems[n_train:n_train + n_val]]
        + [("test", s) for s in stems[n_train + n_val:]]
    )

    has_labels = (task_dir / "labels").exists()

    # stage into temp dirs first, then swap in, so a crash mid-run can't leave
    # you with a half-mixed dataset
    tmp_root = task_dir / "_split_tmp"
    if tmp_root.exists():
        shutil.rmtree(tmp_root)
    for split in SPLITS:
        (tmp_root / "images" / split).mkdir(parents=True, exist_ok=True)
        if has_labels:
            (tmp_root / "labels" / split).mkdir(parents=True, exist_ok=True)

    missing_labels = []
    for split, stem in split_assignment:
        src_img = unique_images[stem]
        shutil.copy2(src_img, tmp_root / "images" / split / src_img.name)
        if has_labels:
            lbl = find_label(task_dir, stem)
            if lbl:
                shutil.copy2(lbl, tmp_root / "labels" / split / lbl.name)
            else:
                missing_labels.append(stem)

    # swap: remove old split folders, move new ones in
    for split in SPLITS:
        old_img = task_dir / "images" / split
        if old_img.exists():
            shutil.rmtree(old_img)
        shutil.move(str(tmp_root / "images" / split), str(old_img))
        if has_labels:
            old_lbl = task_dir / "labels" / split
            if old_lbl.exists():
                shutil.rmtree(old_lbl)
            shutil.move(str(tmp_root / "labels" / split), str(old_lbl))
    shutil.rmtree(tmp_root, ignore_errors=True)

    print(f"[split] {n} unique images re-split for task={args.task}:")
    print(f"  train: {n_train} ({n_train/n:.0%})")
    print(f"  val:   {n_val} ({n_val/n:.0%})")
    print(f"  test:  {n - n_train - n_val} ({(n - n_train - n_val)/n:.0%})")
    if has_labels and missing_labels:
        print(f"\n[warn] {len(missing_labels)} image(s) had no matching label file (left unlabeled): "
              f"{missing_labels[:10]}{' ...' if len(missing_labels) > 10 else ''}")
    if not has_labels:
        print("\n[note] no labels/ folder found - only images were split. Annotate before training.")


if __name__ == "__main__":
    main()