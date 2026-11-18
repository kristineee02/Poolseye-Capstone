import unittest
from unittest.mock import patch
import threading
import time
from types import SimpleNamespace

import numpy as np

import scripts.live_server as live_server
from scripts.live_server import ACTIVITY_COLORS, _blend_person, match_activity_to_people, render_scene
from scripts.zone_check import draw_skeleton


def person(box):
    return {"xyxy": box}


class DetectionOverlayTest(unittest.TestCase):
    def test_matches_each_activity_box_to_only_one_person(self):
        people = [person([10, 10, 50, 100]), person([80, 10, 120, 100])]
        boxes = [
            {"xyxy": [8, 12, 52, 98], "name": "Normal", "conf": 0.9},
            {"xyxy": [78, 12, 122, 98], "name": "Swimming", "conf": 0.8},
        ]

        matched, unmatched = match_activity_to_people(people, boxes)

        self.assertEqual(matched[0]["name"], "Normal")
        self.assertEqual(matched[1]["name"], "Swimming")
        self.assertEqual(unmatched, [])

    def test_keeps_unclaimed_overlapping_box_for_crop_pose_fallback(self):
        people = [person([10, 10, 50, 100])]
        boxes = [
            {"xyxy": [8, 12, 52, 98], "name": "Normal", "conf": 0.9},
            {"xyxy": [12, 15, 48, 95], "name": "Floating", "conf": 0.7},
        ]

        _, unmatched = match_activity_to_people(people, boxes)

        self.assertEqual(len(unmatched), 1)
        self.assertIn(unmatched[0]["name"], {"Normal", "Floating"})

    def test_missing_keypoint_is_not_interpolated_from_zero(self):
        base = {
            "xyxy": np.array([0, 0, 20, 40], dtype=float),
            "foot": (10, 40),
            "left": None,
            "right": None,
            "kxy": np.array([[10, 10], [20, 20]], dtype=float),
            "kcf": np.array([0.9, 0.8], dtype=float),
        }
        later = {
            **base,
            "xyxy": np.array([2, 0, 22, 40], dtype=float),
            "kxy": np.array([[14, 10], [0, 0]], dtype=float),
            "kcf": np.array([0.9, 0.0], dtype=float),
        }

        blended = _blend_person(base, later, 0.25, base)

        np.testing.assert_allclose(blended["kxy"][0], [11, 10])
        np.testing.assert_allclose(blended["kxy"][1], [20, 20])

    def test_skeleton_does_not_draw_implausible_outlier_joint(self):
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        points = np.zeros((17, 2), dtype=float)
        confidence = np.zeros(17, dtype=float)
        points[5], confidence[5] = [20, 20], 0.9
        points[6], confidence[6] = [25, 20], 0.9
        points[7], confidence[7] = [90, 90], 0.9

        draw_skeleton(frame, points, confidence, 0.3, bounds=[10, 10, 40, 60])

        self.assertGreater(int(frame[20, 20].sum()), 0)
        self.assertEqual(int(frame[90, 90].sum()), 0)

    def test_matched_activity_still_draws_pose_person_box(self):
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        keypoints = np.zeros((17, 2), dtype=float)
        confidence = np.zeros(17, dtype=float)
        tracked = {
            "track_id": 4,
            "xyxy": [18, 18, 82, 72],
            "foot": (50, 72),
            "src": "ankles",
            "left": None,
            "right": None,
            "kxy": keypoints,
            "kcf": confidence,
            "zone": "red",
            "event": "RED BOUNDARY CROSSED",
            "supervision": None,
        }
        swimming = {
            "xyxy": [20, 20, 80, 70],
            "name": "Swimming",
            "conf": 0.63,
            "alert": False,
        }

        with patch("scripts.live_server.draw_person") as zone_draw:
            render_scene(
                frame,
                {"people": [tracked], "drowning": [swimming], "activity_poses": []},
                0.3,
            )

        zone_draw.assert_called_once()
        self.assertEqual(zone_draw.call_args.kwargs["activity"]["name"], "Swimming")

    def test_video_upload_interrupts_a_slow_live_camera_open(self):
        started = threading.Event()
        finish = threading.Event()

        class FakeCapture:
            released = False

            def release(self):
                self.released = True

        capture = FakeCapture()

        def slow_open(_kind, _settings):
            started.set()
            finish.wait(1)
            return capture

        live_server._camera_changed.clear()
        try:
            with patch("scripts.live_server.open_capture", side_effect=slow_open):
                timer = threading.Timer(0.05, live_server._camera_changed.set)
                timer.start()
                opened = live_server.open_capture_interruptibly("rtsp", {})
                self.assertTrue(started.is_set())
                self.assertIsNone(opened)
                finish.set()
                deadline = time.time() + 1
                while not capture.released and time.time() < deadline:
                    time.sleep(0.01)
                self.assertTrue(capture.released)
        finally:
            finish.set()
            live_server._camera_changed.clear()

    def test_one_drowning_frame_does_not_replace_swimming(self):
        watcher = live_server.DrowningWatcher(
            SimpleNamespace(names={0: "Drowning", 1: "Floating", 2: "Normal", 3: "Swimming"}),
            {
                "confidence_threshold": 0.3,
                "display_confidence": 0.25,
                "class_confirm_hits": 2,
                "drowning_confirm_hits": 2,
                "drowning_class_confidence": 0.3,
                "class_switch_margin": 1.2,
            },
        )
        swimming = {"xyxy": [10, 10, 60, 80], "name": "Swimming", "conf": 0.7, "alert": False}
        drowning = {"xyxy": [11, 10, 61, 80], "name": "Drowning", "conf": 0.9, "alert": True}

        first = watcher._stabilize_detections([swimming], 1.0)
        transient = watcher._stabilize_detections([drowning], 1.3)

        self.assertEqual(first[0]["name"], "Swimming")
        self.assertEqual(transient[0]["name"], "Swimming")
        self.assertFalse(transient[0]["alert"])

    def test_drowning_requires_repeated_confident_model_evidence(self):
        watcher = live_server.DrowningWatcher(
            SimpleNamespace(names={0: "Drowning", 1: "Floating", 2: "Normal", 3: "Swimming"}),
            {
                "confidence_threshold": 0.3,
                "display_confidence": 0.25,
                "class_confirm_hits": 2,
                "drowning_confirm_hits": 2,
                "drowning_class_confidence": 0.3,
            },
        )
        detection = {"xyxy": [10, 10, 60, 80], "name": "Drowning", "conf": 0.8, "alert": True}

        self.assertEqual(watcher._stabilize_detections([detection], 1.0), [])
        confirmed = watcher._stabilize_detections([detection], 1.3)

        self.assertEqual(confirmed[0]["name"], "Drowning")
        self.assertTrue(confirmed[0]["alert"])


if __name__ == "__main__":
    unittest.main()
