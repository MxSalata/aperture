"""Wording vectors for messages.log entries: the same algorithm as src/lib/logVectors.ts.

An entry (its stamped line and the unstamped lines that continued it) becomes a template: the
time, pid and severity go, the category and message stay, everything is lower-cased, file paths
become <path>, hexadecimal ids <h> and numbers <n>. The words of the template and each pair of
neighbouring words are hashed (FNV-1a, 32 bits) into one of 256 buckets, with a sign taken from
the next bit of the hash, weighted 1 + ln(count), and the bucket vector is normalised to unit
length. Two entries worded the same score 1.0 by cosine; the same message with other numbers or
paths scores 1.0 too; unrelated entries score near 0.

Pure Python: no IRIS here, so `python3 -m unittest discover -s ipm/python/tests` runs anywhere.
Aperture.LogIndex (the package) imports this module from the manager directory it is copied to.
"""

import math
import re

DIMS = 256
DECIMALS = 6

# The stamped line of messages.log: MM/DD/YY-HH:MM:SS[:mmm] (pid) severity [Category] message.
HEADER = re.compile(
    r"^(\d{2})/(\d{2})/(\d{2})-(\d{2}):(\d{2}):(\d{2})(?::(\d{1,3}))?\s+\((\d+)\)\s+([0-3])\s+"
    r"(?:\[([^\]]+)\]\s*)?(.*)$"
)
_WINDOWS_PATH = re.compile(r"[a-z]:\\[^\s]+")
_POSIX_PATH = re.compile(r"(?:/[^\s/]+){2,}/?")
_HEX_PREFIXED = re.compile(r"\b0x[0-9a-f]+\b")
_HEX_ID = re.compile(r"\b(?=[0-9a-f]{6,}\b)(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]+\b")
_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
_TOKEN = re.compile(r"[a-z0-9_<>#%.]+")


def parse_header(line):
    """The parts of a stamped line, or None for a banner or continuation line."""
    m = HEADER.match(line)
    if not m:
        return None
    mm, dd, yy, hh, mi, ss, _ms, pid, sev, category, message = m.groups()
    return {
        "time": "20%s-%s-%s %s:%s:%s" % (yy, mm, dd, hh, mi, ss),
        "pid": int(pid),
        "severity": int(sev),
        "category": category or "",
        "message": message.rstrip(),
    }


def group_entries(lines):
    """Lines as (offset, text) pairs, oldest first, grouped into entries: an unstamped line
    continues the entry before it. Each entry: offset and the parts of its stamped line, with
    the continuation lines appended to `text` (the raw lines) and `message`."""
    entries = []
    for offset, line in lines:
        if not line.strip():
            continue
        parsed = parse_header(line)
        if parsed:
            parsed["offset"] = offset
            parsed["text"] = line
            entries.append(parsed)
        elif entries:
            entries[-1]["text"] += "\n" + line
            entries[-1]["message"] += "\n" + line.rstrip()
    return entries


def normalise(text):
    """The template of an entry's text: what the vector is made of."""
    lines = text.split("\n")
    parsed = parse_header(lines[0]) if lines else None
    if parsed:
        body = parsed["category"] + " " + parsed["message"]
        if len(lines) > 1:
            body += "\n" + "\n".join(lines[1:])
    else:
        body = text
    t = body.lower()
    t = _WINDOWS_PATH.sub("<path>", t)
    t = _POSIX_PATH.sub("<path>", t)
    t = _HEX_PREFIXED.sub("<h>", t)
    t = _HEX_ID.sub("<h>", t)
    t = _NUMBER.sub("<n>", t)
    tokens = [tok.strip(".") for tok in _TOKEN.findall(t)]
    return " ".join(tok for tok in tokens if tok)


def features(template):
    """Counts of the words and neighbouring word pairs of a template."""
    tokens = template.split(" ") if template else []
    counts = {}
    for tok in tokens:
        counts[tok] = counts.get(tok, 0) + 1
    for a, b in zip(tokens, tokens[1:]):
        pair = a + " " + b
        counts[pair] = counts.get(pair, 0) + 1
    return counts


def fnv1a32(text):
    """FNV-1a over the UTF-8 bytes, 32 bits."""
    h = 2166136261
    for byte in text.encode("utf-8"):
        h ^= byte
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def vectorise(text):
    """The unit vector of an entry's wording (DIMS doubles), all zeros for an empty template."""
    v = [0.0] * DIMS
    for feature, count in sorted(features(normalise(text)).items()):
        h = fnv1a32(feature)
        bucket = h & (DIMS - 1)
        sign = -1.0 if (h >> 8) & 1 else 1.0
        v[bucket] += sign * (1.0 + math.log(count))
    norm = math.sqrt(sum(x * x for x in v))
    if norm > 0:
        v = [x / norm for x in v]
    return v


def literal(vector):
    """The vector as TO_VECTOR takes it: comma-separated, six decimals, no negative zero."""
    parts = []
    for x in vector:
        s = "%.*f" % (DECIMALS, x)
        parts.append("0." + "0" * DECIMALS if s == "-0." + "0" * DECIMALS else s)
    return ",".join(parts)


def cosine(a, b):
    """Cosine similarity of two vectors (the dot product for unit vectors)."""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na > 0 and nb > 0 else 0.0
