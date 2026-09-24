/// The log files of the instance for Aperture.API: which ones exist, and one bounded window of
/// one of them. The file work (listing a directory, stat, seek and read) is Embedded Python,
/// which is what it is for; ObjectScript resolves where IRIS writes its logs (the manager
/// directory, and Config.config's ConsoleFile when an administrator moved messages.log).
///
/// Bounded and confined: a window is MAXBYTES at most, a request names a file by the id the
/// catalogue gave it (never a path), the catalogue lists only messages.log, alerts.log,
/// SystemMonitor.log and their rotations in those two directories, and nothing here writes.
Class Aperture.Logs
{

/// The most bytes one read returns (a 100 MB log pages at the same cost as a small one).
Parameter MAXBYTES = 262144;

/// The default window.
Parameter DEFAULTBYTES = 65536;

/// The two places IRIS writes its logs: the manager directory (alerts.log, SystemMonitor.log,
/// and messages.log unless moved) and the configured console log (Config.config, ConsoleFile).
ClassMethod Places(Output mgr As %String, Output console As %String)
{
    Set mgr = ##class(%File).ManagerDirectory(), console = ""
    Try {
        New $Namespace
        Set $Namespace = "%SYS"
        Kill properties
        If ##class(Config.config).Get(.properties) Set console = $Get(properties("ConsoleFile"))
    } Catch {
        // Reading the configuration needs %SYS; without it the manager directory is the answer.
    }
    If console = "" Set console = ##class(%File).NormalizeFilename("messages.log", mgr)
}

/// JSON: the readable log files, the current ones first, then rotations newest first.
ClassMethod Catalog() As %String
{
    Do ..Places(.mgr, .console)
    Quit ..CatalogPython(mgr, console)
}

/// The full path of a catalogued file, or "" for a name the catalogue does not list.
ClassMethod PathOf(id As %String) As %String
{
    Do ..Places(.mgr, .console)
    Quit ..PathOfPython(mgr, console, id)
}

/// JSON: whole lines from a window of at most `bytes` bytes ending at `before` (0: the end of
/// the file). `start` in the answer is the `before` for the window preceding this one.
ClassMethod Window(path As %String, before As %Integer = 0, bytes As %Integer = 0) As %String
{
    Quit ..WindowPython(path, before, bytes, ..#MAXBYTES, ..#DEFAULTBYTES)
}

/// The catalogue as JSON: `[{id, kind, path, size, modified, current}]`. `id` is the file name
/// (what a client sends back), `kind` is messages, alerts or monitor, `modified` is the
/// instance's wall-clock time in the form IRIS uses elsewhere (YYYY-MM-DD HH:MM:SS).
ClassMethod CatalogPython(mgr, console) As %String [ Language = python ]
{
    import json
    import os
    import re
    import datetime

    current = [("messages", str(console)), ("alerts", os.path.join(str(mgr), "alerts.log")),
               ("monitor", os.path.join(str(mgr), "SystemMonitor.log"))]
    # Rotations IRIS makes (messages.old_<date>, messages.log.<n>) and administrators keep
    # (messages_<date>.log); gzip archives are left out: a window cannot be read from them cheaply.
    rotated = re.compile(r"^(messages|alerts)(\.old.*|\.log\.\d+|_\d{8}.*\.log)$")

    def stamp(seconds):
        return datetime.datetime.fromtimestamp(seconds).strftime("%Y-%m-%d %H:%M:%S")

    entries = []
    seen = set()

    def add(kind, path, is_current):
        try:
            st = os.stat(path)
        except OSError:
            return
        if not os.path.isfile(path) or path in seen:
            return
        seen.add(path)
        entries.append({
            "id": os.path.basename(path),
            "kind": kind,
            "path": path,
            "size": int(st.st_size),
            "modified": stamp(st.st_mtime),
            "current": bool(is_current),
        })

    for kind, path in current:
        add(kind, path, True)

    older = []
    for directory in dict.fromkeys([os.path.dirname(str(console)) or str(mgr), str(mgr)]):
        try:
            names = os.listdir(directory)
        except OSError:
            continue
        for name in names:
            m = rotated.match(name)
            if m:
                path = os.path.join(directory, name)
                try:
                    older.append((os.stat(path).st_mtime, m.group(1), path))
                except OSError:
                    pass
    older.sort(reverse=True)
    for _, kind, path in older[:40]:
        add(kind, path, False)

    return json.dumps(entries)
}

ClassMethod PathOfPython(mgr, console, id) As %String [ Language = python ]
{
    import json
    import iris
    wanted = str(id)
    for entry in json.loads(iris.cls("Aperture.Logs").CatalogPython(mgr, console)):
        if entry["id"] == wanted:
            return entry["path"]
    return ""
}

/// One window as JSON: `{size, start, end, lines, hasMore}`. The window ends at `before`
/// (0 or past the end: the end of the file) and starts at most `nbytes` earlier, moved forward
/// to the first whole line; `lines` are the whole lines in it. Paging: pass `start` back as
/// `before`. `hasMore` says whether anything precedes `start`.
ClassMethod WindowPython(path, before, nbytes, maxbytes, defaultbytes) As %String [ Language = python ]
{
    import json
    import os

    path = str(path)
    limit = int(maxbytes or 262144)
    want = int(nbytes or 0) or int(defaultbytes or 65536)
    want = max(1024, min(want, limit))
    size = os.path.getsize(path)
    end = int(before or 0)
    if end <= 0 or end > size:
        end = size
    start = max(0, end - want)
    with open(path, "rb") as handle:
        handle.seek(start)
        data = handle.read(end - start)
    if start > 0:
        # Not at the beginning of the file: the first line is a fragment, skip to the next one.
        cut = data.find(b"\n")
        if cut < 0:
            data = b""
            start = end
        else:
            start += cut + 1
            data = data[cut + 1:]
    text = data.decode("utf-8", errors="replace")
    lines = text.split("\n")
    if text.endswith("\n"):
        lines.pop()
    lines = [line[:-1] if line.endswith("\r") else line for line in lines]
    return json.dumps({
        "size": int(size),
        "start": int(start),
        "end": int(end),
        "lines": lines,
        "hasMore": start > 0,
    })
}

}
