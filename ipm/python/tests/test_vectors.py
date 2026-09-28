"""The Python vectoriser against the shared fixture (python3 -m unittest discover -s ipm/python/tests)."""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'lib'))
import aperture_vectors as av  # noqa: E402

with open(os.path.join(HERE, "fixture.json")) as f:
    FIXTURE = json.load(f)
BY_NAME = {c["name"]: c for c in FIXTURE["cases"]}


class VectoriserTest(unittest.TestCase):
    def test_templates_and_vectors_match_the_fixture(self):
        self.assertEqual(av.DIMS, FIXTURE["dims"])
        for case in FIXTURE["cases"]:
            with self.subTest(case=case["name"]):
                self.assertEqual(av.normalise(case["text"]), case["template"])
                self.assertEqual(av.literal(av.vectorise(case["text"])), case["vector"])

    def test_vectors_are_unit_length_and_deterministic(self):
        for case in FIXTURE["cases"]:
            v = av.vectorise(case["text"])
            self.assertEqual(len(v), av.DIMS)
            self.assertEqual(v, av.vectorise(case["text"]))
            norm = sum(x * x for x in v) ** 0.5
            self.assertTrue(abs(norm - 1) < 1e-9 or (norm == 0 and case["template"] == ""))

    def test_pairs_score_as_the_fixture_says(self):
        for pair in FIXTURE["pairs"]:
            score = av.cosine(av.vectorise(BY_NAME[pair["a"]]["text"]), av.vectorise(BY_NAME[pair["b"]]["text"]))
            with self.subTest(pair=(pair["a"], pair["b"])):
                if "min" in pair:
                    self.assertGreaterEqual(score, pair["min"])
                else:
                    self.assertLessEqual(score, pair["max"])

    def test_header_parsing_and_grouping(self):
        parsed = av.parse_header("09/24/26-21:15:03:123 (1234) 2 [Utility.Event] Private webserver started on 52773")
        self.assertEqual(parsed["time"], "2026-09-24 21:15:03")
        self.assertEqual((parsed["pid"], parsed["severity"], parsed["category"]), (1234, 2, "Utility.Event"))
        self.assertIsNone(av.parse_header("*** Recovery started at Wed Sep 24 21:15:02 2026"))
        entries = av.group_entries(
            [
                (0, "*** banner"),
                (11, "09/24/26-21:15:03 (1) 0 [A] first"),
                (44, "    continued"),
                (58, ""),
                (59, "09/24/26-21:15:04 (2) 1 second"),
            ]
        )
        self.assertEqual([e["offset"] for e in entries], [11, 59])
        self.assertEqual(entries[0]["text"], "09/24/26-21:15:03 (1) 0 [A] first\n    continued")
        self.assertEqual(entries[0]["message"], "first\n    continued")
        self.assertEqual(entries[1]["category"], "")

    def test_literal_has_six_decimals_and_no_negative_zero(self):
        self.assertEqual(av.literal([0.0, -0.0, 0.5, -1e-9]), "0.000000,0.000000,0.500000,0.000000")
        self.assertEqual(len(av.literal(av.vectorise("x")).split(",")), av.DIMS)


if __name__ == "__main__":
    unittest.main()
