/// The index behind "Similar entries" in the Messages log: the entries of messages.log and its
/// rotations with the vector of their wording, in Aperture.LogLine under an HNSW index, and a
/// watermark per file in Aperture.LogIndexFile. The vectors come from
/// ipm/python/lib/aperture_vectors.py (module.xml copies it to {$mgrdir}aperture-python/), the same
/// arithmetic the demo runs in TypeScript.
///
/// Bounded and incremental: a file is first indexed from its newest FIRSTTAIL bytes, then only
/// what was appended since, at most MAXBYTESPERCALL bytes and MAXLINESPERCALL entries per call
/// (each entry is one HNSW insert); a rotation or truncation is noticed by the file's signature
/// and size, and that file starts afresh. A query reads one entry from its file at the offset it
/// was given, vectorises it and asks SQL for the TOPK nearest by VECTOR_COSINE. Nothing here
/// reads outside the catalogued files, and nothing writes outside the two tables.
Class Aperture.LogIndex
{

Parameter DIMS = 256;

/// Bytes of one file one refresh indexes at most; the rest waits for the next call.
Parameter MAXBYTESPERCALL = 2097152;

/// Entries one refresh indexes at most, over all files.
Parameter MAXLINESPERCALL = 4000;

/// The tail a file is first indexed from; what lies before it is never indexed.
Parameter FIRSTTAIL = 8388608;

/// Neighbours a query considers; the summary counts within them.
Parameter TOPK = 250;

/// Cosine similarity from which two entries count as the same message.
Parameter SAME = 0.9;

Parameter MAXTEXT = 2000;

Parameter MAXTEMPLATE = 1000;

/// Where module.xml copies ipm/python/lib/ (aperture_vectors.py).
ClassMethod PythonDir() As %String
{
    Quit ##class(%File).NormalizeDirectory("aperture-python", ##class(%File).ManagerDirectory())
}

/// JSON: what is indexed, per file and in total, and whether a refresh has work to do.
ClassMethod Status() As %String
{
    Quit ..StatusPython(..PythonDir(), ##class(Aperture.Logs).Catalog(), ..#MAXBYTESPERCALL, ..#MAXLINESPERCALL, ..#FIRSTTAIL, ..#DIMS)
}

/// JSON: indexes what was appended since the last call, within the bounds above.
ClassMethod Refresh() As %String
{
    Quit ..RefreshPython(..PythonDir(), ##class(Aperture.Logs).Catalog(), ..#MAXBYTESPERCALL, ..#MAXLINESPERCALL, ..#FIRSTTAIL, ..#MAXTEXT, ..#MAXTEMPLATE, ..#DIMS)
}

/// JSON: the entry at `offset` of the catalogued file at `path` (id `file`), the entries worded
/// most like it with their score, and a summary; `{error, status}` when no entry starts there.
ClassMethod Similar(file As %String, path As %String, offset As %Integer, limit As %Integer = 20) As %String
{
    Quit ..SimilarPython(..PythonDir(), file, path, offset, limit, ..#TOPK, ..#SAME, ..#DIMS, ..#MAXTEXT)
}

/// Empties both tables: before an uninstall, or to start over.
ClassMethod Drop() As %Status
{
    Do ##class(Aperture.LogLine).%KillExtent()
    Do ##class(Aperture.LogIndexFile).%KillExtent()
    Quit $$$OK
}

ClassMethod StatusPython(pydir, catalog, maxbytes, maxlines, firsttail, dims) As %String [ Language = python ]
{
    import json
    import os
    import iris

    files = [f for f in json.loads(str(catalog)) if f.get("kind") == "messages"]
    marks = {}
    for row in iris.sql.exec("SELECT LogFile, IndexedTo, Bytes, Lines, IndexedAt FROM Aperture.LogIndexFile"):
        marks[row[0]] = {"indexedTo": int(row[1] or 0), "bytes": int(row[2] or 0), "lines": int(row[3] or 0), "indexedAt": row[4] or ""}
    out = []
    pending = 0
    for f in files:
        try:
            size = os.path.getsize(f["path"])
        except OSError:
            continue
        mark = marks.get(f["id"])
        if mark:
            todo = max(0, size - mark["indexedTo"])
        else:
            todo = min(size, int(firsttail))
        pending += todo
        out.append({
            "id": f["id"],
            "current": bool(f.get("current")),
            "size": int(size),
            "indexedTo": mark["indexedTo"] if mark else 0,
            "lines": mark["lines"] if mark else 0,
            "indexedAt": mark["indexedAt"] if mark else "",
            "pending": int(todo),
        })
    total = 0
    for row in iris.sql.exec("SELECT COUNT(*) FROM Aperture.LogLine"):
        total = int(row[0] or 0)
    return json.dumps({
        "files": out,
        "lines": total,
        "stale": pending > 0,
        "pendingBytes": int(pending),
        "maxBytesPerCall": int(maxbytes),
        "maxLinesPerCall": int(maxlines),
        "firstTail": int(firsttail),
        "dims": int(dims),
        "index": "HNSW",
        "distance": "cosine",
    })
}

ClassMethod RefreshPython(pydir, catalog, maxbytes, maxlines, firsttail, maxtext, maxtemplate, dims) As %String [ Language = python ]
{
    import datetime
    import hashlib
    import json
    import os
    import sys
    import iris

    pydir = str(pydir)
    if pydir not in sys.path:
        sys.path.insert(0, pydir)
    import aperture_vectors as av

    maxbytes, maxlines, firsttail = int(maxbytes), int(maxlines), int(firsttail)
    maxtext, maxtemplate, dims = int(maxtext), int(maxtemplate), int(dims)
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    insert = ("INSERT INTO Aperture.LogLine (LogFile, ByteOffset, Stamp, Severity, Category, Entry, Template, Embedding) "
              "VALUES (?, ?, ?, ?, ?, ?, ?, TO_VECTOR(?, DOUBLE, %d))" % dims)

    def signature(path):
        with open(path, "rb") as handle:
            return hashlib.sha256(handle.read(512)).hexdigest()

    def line_start(handle, position):
        """`position` moved forward to the start of the next whole line (0 stays 0)."""
        if position <= 0:
            return 0
        handle.seek(position - 1)
        if handle.read(1) == b"\n":
            return position
        cut = handle.read(65536).find(b"\n")
        return position + cut + 1 if cut >= 0 else position + 65536

    report = {"files": [], "lines": 0, "indexedAt": now}
    budget = maxlines
    for f in [x for x in json.loads(str(catalog)) if x.get("kind") == "messages"]:
        fid, path = f["id"], f["path"]
        try:
            size = os.path.getsize(path)
            sig = signature(path)
        except OSError:
            continue
        mark = None
        for row in iris.sql.exec("SELECT Signature, IndexedTo, Lines FROM Aperture.LogIndexFile WHERE LogFile = ?", fid):
            mark = {"signature": row[0], "indexedTo": int(row[1] or 0), "lines": int(row[2] or 0)}
        fresh = mark is None
        if mark and (mark["signature"] != sig or size < mark["indexedTo"]):
            # Another file under this name (a rotation), or the file was truncated: start afresh.
            list(iris.sql.exec("DELETE FROM Aperture.LogLine WHERE LogFile = ?", fid))
            list(iris.sql.exec("DELETE FROM Aperture.LogIndexFile WHERE LogFile = ?", fid))
            mark, fresh = None, True
        entry = {"id": fid, "added": 0, "indexedTo": mark["indexedTo"] if mark else 0, "size": int(size)}
        if budget <= 0:
            entry["pending"] = int(size - entry["indexedTo"])
            report["files"].append(entry)
            continue
        with open(path, "rb") as handle:
            start = line_start(handle, max(0, size - firsttail)) if fresh else mark["indexedTo"]
            end = min(size, start + maxbytes)
            handle.seek(start)
            data = handle.read(max(0, end - start))
        cut = data.rfind(b"\n")
        if cut < 0:
            # No whole line yet (a line still being written): nothing to index this time.
            data, end = b"", start
        else:
            data, end = data[:cut + 1], start + cut + 1
        lines = []
        position = start
        for raw in data.split(b"\n")[:-1]:
            text = raw.decode("utf-8", errors="replace")
            lines.append((position, text[:-1] if text.endswith("\r") else text))
            position += len(raw) + 1
        entries = av.group_entries(lines)
        added = 0
        indexed_to = end
        for i, e in enumerate(entries):
            if budget <= 0:
                indexed_to = e["offset"]
                break
            text = e["text"][:maxtext]
            template = av.normalise(text)
            if not template:
                continue
            vector = av.literal(av.vectorise(text))
            try:
                list(iris.sql.exec(insert, fid, int(e["offset"]), e["time"], int(e["severity"]), e["category"][:64],
                                   text, template[:maxtemplate], vector))
                added += 1
                budget -= 1
            except Exception:
                # Already indexed (the unique index refused it): the watermark was behind, move on.
                pass
        if fresh:
            list(iris.sql.exec(
                "INSERT INTO Aperture.LogIndexFile (LogFile, Path, Signature, IndexedTo, Bytes, Lines, IndexedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
                fid, path, sig, int(indexed_to), int(size), int(added), now))
        else:
            list(iris.sql.exec(
                "UPDATE Aperture.LogIndexFile SET Path = ?, IndexedTo = ?, Bytes = ?, Lines = Lines + ?, IndexedAt = ? WHERE LogFile = ?",
                path, int(indexed_to), int(size), int(added), now, fid))
        entry.update({"added": int(added), "indexedTo": int(indexed_to), "pending": int(size - indexed_to)})
        report["files"].append(entry)
        report["lines"] += added
    report["stale"] = any(f.get("pending", 0) > 0 for f in report["files"])
    return json.dumps(report)
}

ClassMethod SimilarPython(pydir, file, path, offset, limit, topk, same, dims, maxtext) As %String [ Language = python ]
{
    import json
    import os
    import sys
    import iris

    pydir = str(pydir)
    if pydir not in sys.path:
        sys.path.insert(0, pydir)
    import aperture_vectors as av

    fid, path = str(file), str(path)
    offset, limit, topk = int(offset), int(limit), int(topk)
    same, dims, maxtext = float(same), int(dims), int(maxtext)

    # The entry at the offset: its stamped line and the unstamped lines that continued it.
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as handle:
            handle.seek(offset)
            chunk = handle.read(8192)
    except OSError as e:
        return json.dumps({"error": "Cannot read %s: %s" % (fid, e), "status": 404})
    if offset < 0 or offset >= size:
        return json.dumps({"error": "No entry at offset %d of %s (the file is %d bytes)" % (offset, fid, size), "status": 404})
    raw_lines = chunk.split(b"\n")
    lines = [raw.decode("utf-8", errors="replace") for raw in raw_lines]
    lines = [line[:-1] if line.endswith("\r") else line for line in lines]
    parsed = av.parse_header(lines[0]) if lines else None
    if not parsed:
        return json.dumps({"error": "No stamped entry starts at offset %d of %s" % (offset, fid), "status": 404})
    text = lines[0]
    for line in lines[1:9]:
        if av.parse_header(line):
            break
        if line.strip():
            text += "\n" + line
    text = text[:maxtext]
    template = av.normalise(text)
    entry = {
        "file": fid,
        "offset": offset,
        "time": parsed["time"],
        "severity": parsed["severity"],
        "category": parsed["category"],
        "text": text,
        "template": template,
    }
    if not template:
        return json.dumps({"entry": entry, "matches": [], "summary": {"similar": 0, "of": 0, "first": "", "last": "", "threshold": same},
                           "method": "cosine similarity over hashed words (IRIS Vector Search, HNSW index)"})
    vector = av.literal(av.vectorise(text))
    sql = ("SELECT TOP %d LogFile, ByteOffset, Stamp, Severity, Category, Entry, "
           "VECTOR_COSINE(Embedding, TO_VECTOR(?, DOUBLE, %d)) AS Score FROM Aperture.LogLine "
           "ORDER BY VECTOR_COSINE(Embedding, TO_VECTOR(?, DOUBLE, %d)) DESC" % (topk, dims, dims))
    rows = []
    for row in iris.sql.exec(sql, vector, vector):
        rows.append({
            "file": row[0],
            "offset": int(row[1]),
            "time": row[2] or "",
            "severity": None if row[3] is None else int(row[3]),
            "category": row[4] or "",
            "text": row[5] or "",
            "score": round(float(row[6]), 4),
        })
    # Equal scores newest first: the index orders by similarity only.
    rows.sort(key=lambda r: r["time"], reverse=True)
    rows.sort(key=lambda r: r["score"], reverse=True)
    matches = [r for r in rows if not (r["file"] == fid and r["offset"] == offset)][:limit]
    alike = [r for r in rows if r["score"] >= same]
    times = sorted(r["time"] for r in alike if r["time"])
    seen_self = any(r["file"] == fid and r["offset"] == offset for r in rows)
    summary = {
        "similar": len(alike) + (0 if seen_self else 1),
        "of": len(rows),
        "first": min([times[0], entry["time"]]) if times else entry["time"],
        "last": max([times[-1], entry["time"]]) if times else entry["time"],
        "threshold": same,
        "capped": len(rows) >= topk and len(alike) >= topk,
    }
    return json.dumps({
        "entry": entry,
        "matches": matches,
        "summary": summary,
        "method": "cosine similarity over hashed words (IRIS Vector Search, HNSW index)",
    })
}

}
