from ultralytics import YOLO

def main():
    model = YOLO("yolo11n-pose.pt")
    
    results = model.train(
        data="dataset/person_pose/dataset.yaml",
        epochs=50,
        imgsz=640,
        batch=16,
        device="cpu",  # <--- Change this from 0 to "cpu"
        name="pool_person_pose_run"
    )

if __name__ == '__main__':
    main()