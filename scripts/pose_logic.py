import math
import json
from pathlib import Path

# Load DROWNING_LOGIC from scripts/config.json (same file as zone check).
# Zone/intrusion logic is NOT used here.
try:
    _cfg_path = Path(__file__).resolve().parent / "config.json"
    with open(_cfg_path, "r", encoding="utf-8") as f:
        config = json.load(f)
        
    ANGLE_LIMIT = config['DROWNING_LOGIC']['angle_threshold']
    MOVE_LIMIT = config['DROWNING_LOGIC']['movement_threshold']
    CONF_LIMIT = config['DROWNING_LOGIC']['confidence_threshold']
    DANGER_THRESHOLD = config['DROWNING_LOGIC']['danger_time_threshold']
except FileNotFoundError:
    print("Error: config.json not found. Using default values.")
    ANGLE_LIMIT, MOVE_LIMIT, CONF_LIMIT, DANGER_THRESHOLD = 20.0, 5.0, 0.75, 10

class DrowningDetector:
    def __init__(self):
        self.danger_counter = 0

    def process_frame(self, angle, movement, confidence):
        # Confidence Check
        if confidence < CONF_LIMIT:
            return "Low Confidence", 0, False
            
        # Logic Check using Config variables
        if angle < ANGLE_LIMIT and movement < MOVE_LIMIT:
            self.danger_counter += 1
            status = "Danger"
        else:
            self.danger_counter = 0
            status = "Safe"
            
        # Trigger Alert if counter hits threshold
        alert = self.danger_counter >= DANGER_THRESHOLD
        return status, self.danger_counter, alert

# --- Simulation ---
detector = DrowningDetector()

print(f"System loaded with Thresholds: Angle={ANGLE_LIMIT}, Move={MOVE_LIMIT}")

for frame in range(15):
    # Simulate: High confidence, Vertical posture (10 deg), Stationary (2px move)
    conf = 0.9 
    angle, movement = 10.0, 2.0 
    
    status, count, alert = detector.process_frame(angle, movement, conf)
    
    if alert:
        print(f"Frame {frame+1}: >>> CRITICAL ALERT! <<<")
    else:
        print(f"Frame {frame+1}: Status: {status} (Counter: {count})")