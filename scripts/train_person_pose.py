from ultralytics import YOLO

def main():
    model = YOLO("yolo11n-pose.pt")
    
    # Ultralytics to download and set up the required portions of COCO.
    results = model.train(
        data="coco-pose.yaml",
        epochs=50,
        imgsz=640,
        batch=16,
        device=0,
        name="pool_person_pose_coco"
    )

if __name__ == '__main__':
    main()