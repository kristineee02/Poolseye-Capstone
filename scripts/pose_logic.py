import math
import json
import time
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
    """Flags possible drowning once the distress posture holds for
    DANGER_THRESHOLD seconds (wall-clock, so it does not depend on FPS)."""

    def __init__(self):
        self.danger_since = None

    def process_frame(self, angle, movement, confidence, now=None):
        now = time.monotonic() if now is None else now

        if confidence < CONF_LIMIT:
            return "Low Confidence", 0.0, False

        if angle < ANGLE_LIMIT and movement < MOVE_LIMIT:
            if self.danger_since is None:
                self.danger_since = now
            status = "Danger"
        else:
            self.danger_since = None
            status = "Safe"

        held = 0.0 if self.danger_since is None else now - self.danger_since
        return status, held, held >= DANGER_THRESHOLD


if __name__ == "__main__":
    detector = DrowningDetector()
    print(f"Thresholds: Angle={ANGLE_LIMIT}, Move={MOVE_LIMIT}, Hold={DANGER_THRESHOLD}s")

    # Simulate 15 s of a vertical (10 deg), stationary (2 px) swimmer at 1 sample per second.
    for second in range(16):
        status, held, alert = detector.process_frame(10.0, 2.0, 0.9, now=float(second))
        if alert:
            print(f"t={second:>2}s: >>> POSSIBLE DROWNING ({held:.0f}s) <<<")
        else:
            print(f"t={second:>2}s: {status} (held {held:.0f}s)")