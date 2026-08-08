from ultralytics import YOLO

def main():
    # Load standard YOLO11 nano detection model
    model = YOLO("yolo11n.pt")

    # Train on drowning dataset
    model.train(
        data="dataset/drowning/dataset.yaml",
        epochs=100,
        imgsz=640,
        batch=16,
        device=0,
        name="drowning_detection_run"
    )

if __name__ == '__main__':
    main()