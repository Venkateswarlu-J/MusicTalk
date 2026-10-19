import unittest

from src.train_unified import label_for


class UnifiedLabelHandlingTests(unittest.TestCase):
    def test_irmas_non_target_is_known_negative(self):
        self.assertEqual(label_for({
            "source": "IRMAS",
            "instrument_labels": ["violin"],
        }, "piano"), 0)

    def test_openmic_positive_state(self):
        self.assertEqual(label_for({
            "source": "OpenMIC",
            "instrument_labels": ["piano"],
            "label_states": {"piano": "positive"},
        }, "piano"), 1)

    def test_openmic_negative_state(self):
        self.assertEqual(label_for({
            "source": "OpenMIC",
            "instrument_labels": [],
            "label_states": {"piano": "negative"},
        }, "piano"), 0)

    def test_openmic_missing_target_is_unknown(self):
        self.assertIsNone(label_for({
            "source": "OpenMIC",
            "instrument_labels": ["violin"],
            "label_states": {"violin": "positive"},
        }, "piano"))

    def test_legacy_openmic_manifest_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "label_states"):
            label_for({
                "source": "OpenMIC",
                "instrument_labels": ["piano"],
            }, "piano")


if __name__ == "__main__":
    unittest.main()
