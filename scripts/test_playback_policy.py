import unittest

from scripts.playback_policy import should_emit_events


class PlaybackPolicyTest(unittest.TestCase):
    def test_uploaded_video_only_emits_events_on_first_playback(self):
        self.assertTrue(should_emit_events("video", 0))
        self.assertFalse(should_emit_events("video", 1))
        self.assertFalse(should_emit_events("video", 8))

    def test_live_sources_continue_emitting_new_incidents(self):
        self.assertTrue(should_emit_events("rtsp", 0))
        self.assertTrue(should_emit_events("rtsp", 3))
        self.assertTrue(should_emit_events("webcam", 2))


if __name__ == "__main__":
    unittest.main()
