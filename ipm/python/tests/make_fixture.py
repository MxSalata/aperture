"""Writes fixture.json: templates and vectors the TypeScript twin must reproduce exactly, and
pairs that must score above or below a threshold. Run from the repository root:
python3 ipm/python/tests/make_fixture.py"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import aperture_vectors as av  # noqa: E402

CASES = [
    ("webserver", "09/24/26-21:15:03:123 (1234) 0 [Utility.Event] Private webserver started on 52773"),
    ("webserver-other-port", "09/25/26-06:02:44:007 (1301) 0 [Utility.Event] Private webserver started on 8080"),
    ("expand-user-32", "09/24/26-22:10:00:500 (1388) 0 [Utility.Event] Database USER expanded by 32MB"),
    ("expand-user-64", "09/26/26-03:41:12:001 (1422) 0 [Utility.Event] Database USER expanded by 64MB"),
    ("expand-irisapp", "09/26/26-03:41:12:001 (1422) 0 [Utility.Event] Database IRISAPP expanded by 64MB"),
    ("purge-4210", "09/24/26-23:00:01 (1250) 0 [Utility.Event] Ens.MessageHeader purge: 4210 headers, 4210 bodies removed"),
    ("purge-77", "09/27/26-23:00:01 (1250) 0 [Utility.Event] Ens.MessageHeader purge: 77 headers, 77 bodies removed"),
    (
        "sftp-refused",
        "09/25/26-02:00:05:311 (1333) 2 [Generic.Event] ERROR #5002: SFTP connection refused (task Nightly HL7 archive export)\n    at zRunTask+42^%SYS.Task.1",
    ),
    ("sftp-auth", "09/25/26-02:00:06:002 (1333) 2 [Utility.Event] ERROR <ENSSFTP>: authentication failed for user hl7archive at sftp.lab.local"),
    ("journal-switch", "09/24/26-21:20:00:000 (1234) 0 [Utility.Event] Journal file switched to /usr/irissys/mgr/journal/20260924.003"),
    ("hex-id", "09/24/26-21:21:00:000 (1234) 1 [Generic.Event] Process 0x1f3a9c terminated, session id a3f9c2d1e4 closed"),
    ("banner", "*** Recovery started at Wed Sep 24 21:15:02 2026"),
    ("license", "09/24/26-21:30:00:000 (1234) 1 [Generic.Event] License usage 61% of 20 units"),
    ("windows-path", "09/24/26-21:31:00:000 (1234) 2 [Utility.Event] Cannot open C:\\InterSystems\\IRIS\\mgr\\messages.log"),
    ("unicode", "09/24/26-21:32:00:000 (1234) 0 [Generic.Event] Benutzer Müller meldete Fehler ß in Straße 12"),
    ("empty", ""),
]
PAIRS = [
    ("webserver", "webserver-other-port", "min", 0.9),
    ("expand-user-32", "expand-user-64", "min", 0.9),
    ("purge-4210", "purge-77", "min", 0.9),
    ("expand-user-32", "expand-irisapp", "min", 0.5),
    ("webserver", "sftp-auth", "max", 0.3),
    ("expand-user-32", "journal-switch", "max", 0.3),
    ("sftp-refused", "license", "max", 0.3),
    ("banner", "hex-id", "max", 0.3),
]

cases = []
for name, text in CASES:
    cases.append({"name": name, "text": text, "template": av.normalise(text), "vector": av.literal(av.vectorise(text))})
vectors = {c["name"]: av.vectorise(c["text"]) for c in cases}
pairs = []
for a, b, kind, threshold in PAIRS:
    score = av.cosine(vectors[a], vectors[b])
    ok = score >= threshold if kind == "min" else score <= threshold
    print("%-18s %-22s %.3f %s %.1f %s" % (a, b, score, ">=" if kind == "min" else "<=", threshold, "ok" if ok else "FAIL"))
    pairs.append({"a": a, "b": b, kind: threshold})
out = {"dims": av.DIMS, "decimals": av.DECIMALS, "cases": cases, "pairs": pairs}
with open(os.path.join(HERE, "fixture.json"), "w") as f:
    json.dump(out, f, indent=2)
    f.write("\n")
print("fixture.json written with %d cases and %d pairs" % (len(cases), len(pairs)))
