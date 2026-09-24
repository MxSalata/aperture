/// Aperture's own REST API, served by the /api/aperture web application that module.xml creates
/// (password authentication, resource %Admin_Operate). It exists for the one thing the SysAdmin
/// API has no route for and administrators read every day: the instance's log files
/// (messages.log, alerts.log, SystemMonitor.log and their rotations). Everything else the portal
/// does goes through /api/admin.
///
/// Read-only by construction: no route changes anything, every route needs %Admin_Operate:USE
/// (checked here, and required by the web application), a file is named by the name the
/// catalogue gave it and never by a path, and a read returns one bounded window (256 KiB at most).
/// The file work is Embedded Python in Aperture.Logs.
///
///   GET /api/aperture/            what this is
///   GET /api/aperture/logs        the readable log files, with size and modification time
///   GET /api/aperture/logs/read?file=messages.log&before=0&bytes=65536
///                                 a window of whole lines ending at `before` (0 = the end of
///                                 the file); `start` in the answer is the `before` of the
///                                 previous window, so a client pages backwards at constant cost
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
    Set info.version = "1.0.0"
    Set info.readOnly = 1
    Set info.resource = ..#RESOURCE_":USE"
    Set info.routes = ["GET /logs", "GET /logs/read?file=&before=&bytes="]
    Set info.maxBytes = ##class(Aperture.Logs).#MAXBYTES
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

}
