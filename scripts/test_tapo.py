import cv2

# Replace these values with your actual Tapo credentials and IP address:
# Example: "rtsp://admin:poolseye123@192.168.1.50:554/stream1"
rtsp_url = "rtsp://admin123:poolseye123@192.168.1.19:554/stream1"

print("Attempting to connect to Tapo C320WS stream...")
cap = cv2.VideoCapture(rtsp_url)

if not cap.isOpened():
    print("Error: Could not connect to the camera. Check your IP address, username, or password!")
else:
    print("Success! Stream opened. Press 'q' on your keyboard to close the video window.")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        print("Error: Failed to grab frame from stream. The connection might have dropped.")
        break

    # Display the live video frame from your camera in a pop-up window
    cv2.imshow("PoolsEye - Tapo C320WS Live Stream", frame)

    # Press 'q' on your keyboard to quit the live view loop
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()