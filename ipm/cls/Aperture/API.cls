/// Aperture's own REST API, served by the /api/aperture web application that module.xml creates
/// (password authentication, resource %Admin_Operate). It exists for the one thing the SysAdmin
/// API has no route for and administrators read every day: the instance's log files
/// (messages.log, alerts.log, SystemMonitor.log and their rotations). Everything else the portal
/// does goes through /api/admin.
///
/// Read-only towards the instance: no route changes anything of it, every route needs
/// %Admin_Operate:USE (checked here, and required by the web application), a file is named by
/// the name the catalogue gave it and never by a path, and a read returns one bounded window
/// (256 KiB at most). The file work is Embedded Python in Aperture.Logs. The one thing the
/// package writes is its own index of the entries' wording (Aperture.LogIndex, two tables of
/// the package's namespace), behind "similar entries".
///
///   GET  /api/aperture/            what this is
///   GET  /api/aperture/logs        the readable log files, with size and modification time
///   GET  /api/aperture/logs/read?file=messages.log&before=0&bytes=65536
///                                  a window of whole lines ending at `before` (0 = the end of
///                                  the file) with their byte offsets; `start` in the answer is
///                                  the `before` of the previous window, so a client pages
///                                  backwards at constant cost
///   GET  /api/aperture/logs/index  what the wording index holds, and whether it is behind
///   POST /api/aperture/logs/index  index what was appended since (bounded per call)
///   GET  /api/aperture/logs/similar?file=messages.log&offset=12345&limit=20
///                                  the entry at that offset, the entries worded most like it
///                                  (VECTOR_COSINE over the HNSW index) with their score, and
///                                  how often and when the same message was seen
Class Aperture.API Extends %CSP.REST
{

Parameter HandleCorsRequest = 0;

Parameter CHARSET = "utf-8";

Parameter CONTENTTYPE = "application/json";

/// No CSP session: every request carries its own credentials, like /api/mgmnt.
Parameter UseSession As Integer = 0;

/// The privilege every route needs; reading the instance's logs is what it is for.
Parameter RESOURCE = "%Admin_Operate";

XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
<Route Url="/" Method="GET" Call="Info"/>
<Route Url="/logs" Method="GET" Call="Sources"/>
<Route Url="/logs/read" Method="GET" Call="Read"/>
<Route Url="/logs/index" Method="GET" Call="IndexStatus"/>
<Route Url="/logs/index" Method="POST" Call="IndexRefresh"/>
<Route Url="/logs/similar" Method="GET" Call="Similar"/>
</Routes>
}

ClassMethod Allowed() As %Boolean
{
    Quit $SYSTEM.Security.Check(..#RESOURCE, "USE")
}

/// A JSON error with the HTTP status the client can act on (401 is the web server's own).
ClassMethod Refuse(code As %Integer, message As %String) As %Status
{
    Set %response.Status = $Case(code, 400: "400 Bad Request", 403: "403 Forbidden", 404: "404 Not Found", : code_" Error")
    Set error = {}
    Set error.error = message
    Set error.status = code
    Write error.%ToJSON()
    Quit $$$OK
}

ClassMethod Info() As %Status
{
    If '..Allowed() Quit ..Refuse(403, "Requires "_..#RESOURCE_":USE")
    Set info = {}
    Set info.application = "Aperture log reader"
    Set info.version = "1.1.0"
    Set info.readOnly = 1
    Set info.resource = ..#RESOURCE_":USE"
    Set info.routes = ["GET /logs", "GET /logs/read?file=&before=&bytes=", "GET /logs/index", "POST /logs/index", "GET /logs/similar?file=&offset=&limit="]
    Set info.maxBytes = ##class(Aperture.Logs).#MAXBYTES
    Set similarity = {}
    Set similarity.dims = ##class(Aperture.LogIndex).#DIMS
    Set similarity.index = "HNSW"
    Set similarity.distance = "cosine"
    Set similarity.method = "hashed words"
    Set info.similarity = similarity
    Write info.%ToJSON()
    Quit $$$OK
}

ClassMethod Sources() As %Status
{
    If '..Allowed() Quit ..Refuse(403, "Requires "_..#RESOURCE_":USE")
    Write ##class(Aperture.Logs).Catalog()
    Quit $$$OK
}

ClassMethod Read() As %Status
{
    If '..Allowed() Quit ..Refuse(403, "Requires "_..#RESOURCE_":USE")
    Set file = $Get(%request.Data("file", 1))
    Set before = +$Get(%request.Data("before", 1))
    Set bytes = +$Get(%request.Data("bytes", 1))
    If file = "" Quit ..Refuse(400, "file is required: the id of a catalogued log file (GET /logs)")
    Set path = ##class(Aperture.Logs).PathOf(file)
    If path = "" Quit ..Refuse(404, "Not a catalogued log file: "_file)
    Write ##class(Aperture.Logs).Window(path, before, bytes)
    Quit $$$OK
}

ClassMethod IndexStatus() As %Status
{
    If '..Allowed() Quit ..Refuse(403, "Requires "_..#RESOURCE_":USE")
    Try {
        Write ##class(Aperture.LogIndex).Status()
    } Catch ex {
        Return ..Refuse(500, "The wording index cannot be read: "_ex.DisplayString())
    }
    Quit $$$OK
}

/// Indexes what was appended since the last call, within Aperture.LogIndex's bounds; the
/// answer says what was added and whether more waits for another call.
ClassMethod IndexRefresh() As %Status
{
    If '..Allowed() Quit ..Refuse(403, "Requires "_..#RESOURCE_":USE")
    Try {
        Write ##class(Aperture.LogIndex).Refresh()
    } Catch ex {
        Return ..Refuse(500, "The wording index cannot be refreshed: "_ex.DisplayString())
    }
    Quit $$$OK
}

/// The entry at `offset` of the catalogued file `file` and the entries worded most like it.
/// When the index is behind the files, one bounded refresh runs first, so the answer includes
/// the newest lines; a client that wants the whole backlog indexed calls POST /logs/index until
/// the answer's `stale` is false.
ClassMethod Similar() As %Status
{
    If '..Allowed() Quit ..Refuse(403, "Requires "_..#RESOURCE_":USE")
    Set file = $Get(%request.Data("file", 1))
    Set offset = $Get(%request.Data("offset", 1))
    Set limit = +$Get(%request.Data("limit", 1))
    If file = "" Quit ..Refuse(400, "file is required: the id of a catalogued log file (GET /logs)")
    If (offset = "") || (offset '= +offset) || (offset < 0) Quit ..Refuse(400, "offset is required: the byte offset of the entry's stamped line (GET /logs/read answers them)")
    If limit < 1 Set limit = 20
    If limit > 100 Set limit = 100
    Set path = ##class(Aperture.Logs).PathOf(file)
    If path = "" Quit ..Refuse(404, "Not a catalogued log file: "_file)
    Try {
        Set status = {}.%FromJSON(##class(Aperture.LogIndex).Status())
        If status.stale Do ##class(Aperture.LogIndex).Refresh()
        Set answer = ##class(Aperture.LogIndex).Similar(file, path, +offset, limit)
        Set parsed = {}.%FromJSON(answer)
        If parsed.error '= "" Return ..Refuse(parsed.status, parsed.error)
        Write answer
    } Catch ex {
        Return ..Refuse(500, "Similar entries failed: "_ex.DisplayString())
    }
    Quit $$$OK
}

}
