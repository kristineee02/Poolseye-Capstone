import unittest
from unittest.mock import patch
import threading
import time
from types import SimpleNamespace

import numpy as np

import scripts.live_server as live_server
from scripts.live_server import (
    ACTIVITY_COLORS,
    _blend_person,
    crowding_state,
    draw_drowning_boxes,
    match_activity_to_people,
    render_scene,
)
from scripts.zone_check import COLORS, check_supervision, draw_person, draw_skeleton


def person(box):
    return {"xyxy": box}


class DetectionOverlayTest(unittest.TestCase):
    def test_ordinary_box_labels_are_status_word_only(self):
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        with patch("scripts.zone_check._draw_compact_tags") as compact_tags:
            draw_person(
                frame, 3, [10, 10, 80, 80], (45, 80), "box", None, None,
                np.zeros((17, 2)), np.zeros(17), 0.3, "yellow", "ENTERED POOL AREA",
                supervision_data={"status": "supervised", "separation_distance": 0.45},
                activity={"name": "Swimming", "conf": 0.91, "alert": False},
                show_keypoints=False, show_foot_markers=False,
            )

        compact_tags.assert_called_once()
        self.assertEqual([tag[0] for tag in compact_tags.call_args.args[3]], ["P3 · SWIMMING"])
        self.assertEqual(compact_tags.call_args.kwargs["placement"], "above")

    def test_unmatched_noncritical_activity_box_keeps_activity_text(self):
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        swimming = {"xyxy": [10, 10, 80, 80], "name": "Swimming", "conf": 0.91, "alert": False}

        with patch("scripts.live_server._draw_activity_label") as activity_label:
            draw_drowning_boxes(frame, [swimming])

        activity_label.assert_called_once()

    def test_drowning_visual_overrides_unsupervised_status(self):
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        with patch("scripts.zone_check._draw_compact_tags") as compact_tags:
            draw_person(
                frame, 9, [10, 10, 80, 80], (45, 80), "box", None, None,
                np.zeros((17, 2)), np.zeros(17), 0.3, "orange", None,
                supervision_data={"status": "unsupervised", "separation_distance": None},
                activity={"name": "Drowning", "conf": 0.81, "alert": True},
                show_keypoints=False, show_foot_markers=False,
            )

        compact_tags.assert_called_once()
        self.assertEqual([tag[0] for tag in compact_tags.call_args.args[3]], ["P9 · DROWNING"])

    def test_horizontal_nearby_swimmers_are_supervised(self):
        people = [
            {"id": 1, "zone": "yellow", "foot": (300, 300), "xyxy": [200, 250, 370, 320]},
            {"id": 2, "zone": "yellow", "foot": (350, 300), "xyxy": [280, 250, 450, 320]},
        ]
        config = {
            "enabled": True,
            "threshold_meters": 0.7,
            "check_zones": ["yellow", "red", "orange"],
            "supervisor_zones": ["clear", "yellow", "red", "orange"],
        }

        unsupervised = check_supervision(people, config, 1000)

        self.assertEqual(unsupervised, [])
        self.assertTrue(all(person["supervised"] for person in people))

    def test_supervision_does_not_change_activity_box_colors(self):
        frame = np.zeros((120, 220, 3), dtype=np.uint8)
        base = {
            "foot": (30, 90), "src": "box", "left": None, "right": None,
            "kxy": np.zeros((17, 2), dtype=float), "kcf": np.zeros(17, dtype=float),
            "zone": "yellow", "event": None,
        }
        scene = {
            "people": [
                {**base, "track_id": 1, "xyxy": [10, 20, 80, 90],
                 "supervision": {"status": "supervised", "supervised": True, "separation_distance": 0.5}},
                {**base, "track_id": 2, "xyxy": [120, 20, 200, 90], "foot": (160, 90),
                 "supervision": {"status": "unsupervised", "supervised": False, "separation_distance": 1.2}},
            ],
            "overlay": None,
            "drowning": [
                {"xyxy": [10, 20, 80, 90], "name": "Swimming", "conf": 0.8, "alert": False},
                {"xyxy": [120, 20, 200, 90], "name": "Swimming", "conf": 0.8, "alert": False},
            ],
            "activity_poses": [],
        }

        rendered = render_scene(frame, scene, 0.3)

        np.testing.assert_array_equal(rendered[20, 10], ACTIVITY_COLORS["swimming"])
        np.testing.assert_array_equal(rendered[20, 120], ACTIVITY_COLORS["swimming"])

    def test_supervision_uses_separate_status_dots_and_alert_banner(self):
        frame = np.zeros((180, 240, 3), dtype=np.uint8)
        base = {
            "src": "box", "left": None, "right": None,
            "kxy": np.zeros((17, 2), dtype=float), "kcf": np.zeros(17, dtype=float),
            "zone": "yellow", "event": None,
        }
        scene = {
            "people": [
                {**base, "track_id": 1, "xyxy": [10, 60, 90, 140], "foot": (50, 140),
                 "supervision": {"status": "supervised", "supervised": True}},
                {**base, "track_id": 2, "xyxy": [130, 60, 220, 140], "foot": (175, 140),
                 "supervision": {"status": "unsupervised", "supervised": False}},
            ],
            "overlay": None,
            "drowning": [
                {"xyxy": [10, 60, 90, 140], "name": "Normal", "conf": 0.8, "alert": False},
                {"xyxy": [130, 60, 220, 140], "name": "Swimming", "conf": 0.8, "alert": False},
            ],
            "activity_poses": [],
        }

        rendered = render_scene(
            frame, scene, 0.3,
            {"show_supervision_indicator": True, "show_supervision_banner": True},
        )

        np.testing.assert_array_equal(rendered[60, 90], COLORS["supervised"])
        np.testing.assert_array_equal(rendered[60, 220], COLORS["unsupervised"])
        np.testing.assert_array_equal(rendered[10, 10], COLORS["unsupervised"])

    def test_crowding_uses_the_same_configurable_person_count_rule(self):
        config = {"enabled": True, "person_threshold": 5}
        self.assertFalse(crowding_state(4, config)["crowded"])
        self.assertTrue(crowding_state(5, config)["crowded"])

    def test_scene_keeps_latest_pose_when_display_frame_is_newer(self):
        tracked = {
            "track_id": 7,
            "xyxy": np.array([10, 10, 50, 80], dtype=float),
            "foot": (30, 80),
            "left": None,
            "right": None,
            "kxy": np.zeros((17, 2), dtype=float),
            "kcf": np.zeros(17, dtype=float),
        }
        scene = {
            "seq": 10,
            "ts": 1.0,
            "ready_at": 5.0,
            "epoch": 0,
            "people": [tracked],
            "overlay": None,
        }

        rendered = live_server.scene_at([scene], seq=20, ts=2.0)

        self.assertEqual(rendered["people"][0]["track_id"], 7)

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

    def test_matched_activity_uses_trained_activity_box(self):
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
        self.assertEqual(zone_draw.call_args.args[2], swimming["xyxy"])

    def test_enabled_live_overlay_draws_skeletal_keypoints(self):
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        tracked = {
            "track_id": 4, "xyxy": [18, 18, 82, 72], "foot": (50, 72), "src": "ankles",
            "left": (30, 70), "right": (60, 70),
            "kxy": np.ones((17, 2), dtype=float) * 40,
            "kcf": np.ones(17, dtype=float), "zone": "yellow", "event": None,
            "supervision": None,
        }

        with patch(f"{live_server.draw_person.__module__}.draw_skeleton") as skeleton_draw:
            render_scene(
                frame, {"people": [tracked], "drowning": [], "activity_poses": []}, 0.3,
                {"show_keypoints": True},
            )

        skeleton_draw.assert_called_once()

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

        self.assertEqual(watcher._stabilize_detections([swimming], 1.0), [])
        first = watcher._stabilize_detections([swimming], 1.15)
        transient = watcher._stabilize_detections([drowning], 1.3)

        self.assertEqual(first[0]["name"], "Swimming")
        self.assertEqual(transient[0]["name"], "Swimming")
        self.assertFalse(transient[0]["alert"])

    def test_ordinary_activity_requires_repeated_model_agreement(self):
        watcher = live_server.DrowningWatcher(
            SimpleNamespace(names={0: "Drowning", 1: "Floating", 2: "Normal", 3: "Swimming"}),
            {"class_confirm_hits": 2, "drowning_confirm_hits": 1},
        )
        floating = {"xyxy": [10, 10, 60, 80], "name": "Floating", "conf": 0.8, "alert": False}

        self.assertEqual(watcher._stabilize_detections([floating], 1.0), [])
        confirmed = watcher._stabilize_detections([floating], 1.2)

        self.assertEqual(confirmed[0]["name"], "Floating")

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

    def test_configured_one_hit_drowning_displays_immediately(self):
        watcher = live_server.DrowningWatcher(
            SimpleNamespace(names={0: "Drowning", 1: "Floating", 2: "Normal", 3: "Swimming"}),
            {
                "confidence_threshold": 0.3,
                "class_confirm_hits": 2,
                "drowning_confirm_hits": 1,
                "drowning_class_confidence": 0.3,
            },
        )
        detection = {"xyxy": [10, 10, 60, 80], "name": "Drowning", "conf": 0.8, "alert": True}

        result = watcher._stabilize_detections([detection], 1.0)

        self.assertEqual(result[0]["name"], "Drowning")
        self.assertTrue(result[0]["alert"])

    def test_close_up_activity_box_is_kept_for_both_sources(self):
        watcher = live_server.DrowningWatcher(
            SimpleNamespace(names={0: "Drowning", 1: "Floating", 2: "Normal", 3: "Swimming"}),
            {"max_box_area": 0.9},
        )
        close_up_box = [0, 0, 80, 80]  # 64% of a 100 x 100 frame

        self.assertTrue(watcher.box_area_allowed(close_up_box, 100, 100, use_zones=True))
        self.assertTrue(watcher.box_area_allowed(close_up_box, 100, 100, use_zones=False))

    def test_shared_pose_filter_accepts_horizontal_partial_swimmers(self):
        pose_filter = live_server.person_filter_from_config({
            "person_confidence": 0.3,
            "require_upper_body": False,
            "require_side_agreement": False,
            "min_keypoints": 3,
            "min_keypoint_spread": 0.15,
        })

        self.assertFalse(pose_filter["require_upper_body"])
        self.assertFalse(pose_filter["require_side_agreement"])
        self.assertEqual(pose_filter["min_keypoints"], 3)


if __name__ == "__main__":
    unittest.main()
