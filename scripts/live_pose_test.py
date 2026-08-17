import cv2
from ultralytics import YOLO

# Load the YOLOv11-Pose model (downloads automatically if missing)
model = YOLO("yolo11n-pose.pt")

# Put your exact Tapo Camera RTSP URL here (with your actual password and IP)
rtsp_url = "rtsp://admin123:poolseye123@192.168.1.19:554/stream1"

print("Starting live pose estimation from Tapo C320WS... Press 'q' to quit.")
cap = cv2.VideoCapture(rtsp_url)

if not cap.isOpened():
    print("Error: Could not open camera stream. Check your IP address or credentials.")
    exit()

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        print("Error: Failed to grab frame from camera.")
        break

    # Run YOLOv11-Pose inference on the live frame
    results = model(frame, conf=0.5)

    # Plot the skeletal keypoints and bounding boxes on the video frame
    annotated_frame = results[0].plot()

    # Display the result in a real-time window
    cv2.imshow("PoolsEye - Tapo Live Pose Tracking", annotated_frame)

    # Press 'q' on your keyboard to close the window
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()