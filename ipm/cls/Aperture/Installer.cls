/// Install-time helpers for the iris-aperture IPM package (see module.xml).
///
/// The work is done in Embedded Python (IRIS 2021.2+): the same Security.Applications
/// objects the portal reaches over REST are driven here from Python through the `iris`
/// module. An ObjectScript fallback covers instances where Python is not usable.
///
/// Called from:
///   module.xml               <Invoke Method="Configure" Phase="Configure"/> and <Invoke Method="Doctor" Phase="Activate"/>
///   docker/iris/init.script  at image build time (after `zpm "load"`)
///   the CI job verify-iris   inside the running container
///   any terminal             iris session IRIS -U USER "##class(Aperture.Installer).Doctor()"
Class Aperture.Installer
{

/// Web application of the SysAdmin REST API the portal talks to.
Parameter API = "/api/admin";

/// Web application module.xml creates for the portal itself.
Parameter PORTAL = "/aperture";

/// Web application module.xml creates for the log reader (Aperture.API, read-only).
Parameter LOGAPI = "/api/aperture";

/// Makes sure /api/admin is enabled with password and JWT authentication so the portal can
/// sign in straight after `zpm "install iris-aperture"`. Python first, ObjectScript fallback.
ClassMethod Configure() As %Status
{
    Set sc = $$$OK
    Try {
        Set sc = ..ConfigurePython(..#API)
    } Catch ex {
        Write !, "Aperture: the Embedded Python configuration did not complete (", ex.DisplayString(), "), using the ObjectScript fallback"
        Set sc = ..ConfigureObjectScript(..#API)
    }
    Return sc
}

/// Readiness report: IRIS version, JWT availability, the state of /api/admin (enabled,
/// password + JWT authentication), the /aperture web application and its files on disk.
/// Safe to run at any time; never changes anything.
/// module.xml runs this in the Activate phase: where Embedded Python is not usable the report
/// is skipped with a note, and the installation (which Configure completed) still succeeds.
ClassMethod Doctor() As %Status
{
    Set sc = $$$OK
    Try {
        Set sc = ..DoctorPython(..#API, ..#PORTAL, ..#LOGAPI)
    } Catch ex {
        Write !, "Aperture: readiness report skipped, Embedded Python is not usable here (", ex.DisplayString(), ")", !
    }
    Return sc
}

/// Embedded Python implementation of <method>Configure</method>.
/// Reads the row id through SQL (independent of the class's IdKey), opens the object,
/// adds the password bit to AutheEnabled without touching the other bits, and turns on
/// JWTAuthEnabled when the property exists (IRIS 2026.2+).
ClassMethod ConfigurePython(api As %String) As %Status [ Language = python ]
{
    import iris

    process = iris.system.Process
    previous = process.NameSpace()
    process.SetNamespace("%SYS")            # Security.Applications lives in %SYS
    try:
        applications = iris.cls("Security.Applications")
        if not applications.Exists(api):
            print("Aperture: web application " + api + " not found; the portal needs IRIS 2026.2+ (SysAdmin API v2)")
            return 1

        app_id = None
        for row in iris.sql.exec("SELECT %ID FROM Security.Applications WHERE Name = ?", api):
            app_id = row[0]
        app = applications._OpenId(app_id)

        password_bit = 32                   # $$$AutheCache: password authentication
        before = int(app.AutheEnabled or 0)
        app.Enabled = 1
        app.AutheEnabled = before | password_bit
        has_jwt = bool(iris.cls("%Dictionary.CompiledProperty")._ExistsId("Security.Applications||JWTAuthEnabled"))
        if has_jwt:
            app.JWTAuthEnabled = 1          # bearer tokens through POST /login
        status = app._Save()
        if status != 1:
            raise RuntimeError(iris.cls("%SYSTEM.Status").GetErrorText(status))

        jwt_text = "on" if has_jwt else "not available before IRIS 2026.2, the portal falls back to HTTP Basic"
        print("Aperture: " + api + " enabled; AutheEnabled " + str(before) + " -> " + str(before | password_bit) + "; JWT " + jwt_text)
        print("Aperture: open http://<host>:52773/aperture/index.html and sign in with an account holding %Admin_* privileges")
        return 1
    finally:
        process.SetNamespace(previous)
}

/// Embedded Python implementation of <method>Doctor</method>.
ClassMethod DoctorPython(api As %String, portal As %String, logapi As %String = "/api/aperture") As %Status [ Language = python ]
{
    import iris
    import os

    process = iris.system.Process
    previous = process.NameSpace()
    # The log reader's classes live in the namespace the package was installed in (this one), so its
    # catalogue is read before switching to %SYS for the Security.Applications checks.
    catalog_names = []
    catalog_error = None
    try:
        import json
        catalog_names = [e["id"] for e in json.loads(iris.cls("Aperture.Logs").Catalog())]
    except Exception as ex:
        catalog_error = str(ex)
    process.SetNamespace("%SYS")
    try:
        applications = iris.cls("Security.Applications")
        rows = []

        def check(ok, label, detail=""):
            rows.append(("ok" if ok else "!!", label, detail))
            return ok

        def open_app(name):
            app_id = None
            for row in iris.sql.exec("SELECT %ID FROM Security.Applications WHERE Name = ?", name):
                app_id = row[0]
            return applications._OpenId(app_id) if app_id is not None else None

        version = iris.system.Version.GetNumber()
        parts = version.split(".")
        major = (int(parts[0]), int(parts[1]))
        check(major >= (2026, 2), "IRIS " + version, "the portal needs SysAdmin API v2, which ships with 2026.2")

        has_jwt = bool(iris.cls("%Dictionary.CompiledProperty")._ExistsId("Security.Applications||JWTAuthEnabled"))
        check(True, "JWT login (POST /login)", "available, IRIS 2026.2+" if has_jwt else "not on this version, the portal uses HTTP Basic")

        app = open_app(api)
        if app is None:
            check(False, api, "web application missing")
        else:
            authe = int(app.AutheEnabled or 0)
            check(int(app.Enabled or 0) == 1, api + " enabled")
            check(authe & 32 == 32, api + " password authentication", "AutheEnabled=" + str(authe))
            if has_jwt:
                check(int(app.JWTAuthEnabled or 0) == 1, api + " JWT authentication", "JWTAuthEnabled")

        site = open_app(portal)
        if site is None:
            check(False, portal + " web application", "not created; install through module.xml or docker compose")
        else:
            path = str(site.Path or "")
            check(int(site.Enabled or 0) == 1 and int(site.ServeFiles or 0) == 1, portal + " web application", "serves files from " + path)
            index = os.path.join(path, "index.html")
            check(os.path.isfile(index), portal + " files on disk", index)

        reader = open_app(logapi)
        if reader is None:
            check(False, logapi + " log reader", "web application missing; the Logs screen cannot read messages.log")
        else:
            dispatch = str(reader.DispatchClass or "")
            # A dispatch class only runs where CSP/ZEN is enabled: with CSPZENEnabled off, IRIS
            # answers 404 to every request, whatever the class (CI run 36070001055).
            zen = int(getattr(reader, "CSPZENEnabled", 1) or 0) == 1
            ok = int(reader.Enabled or 0) == 1 and dispatch == "Aperture.API" and zen
            check(ok, logapi + " log reader", "dispatch class " + (dispatch or "(none)") + ", namespace " + str(reader.NameSpace or "") + ("" if zen else ", CSPZENEnabled off: classes cannot run"))
            # The catalogue itself: what the Logs screen will list, read through the same code.
            if catalog_error is not None:
                check(False, "log files readable", catalog_error)
            else:
                check(len(catalog_names) > 0, "log files readable", ", ".join(catalog_names[:5]) + (" …" if len(catalog_names) > 5 else ""))

        print("\nAperture readiness report")
        for mark, label, detail in rows:
            line = "  " + mark + "  " + label
            if detail:
                line = line + "  (" + detail + ")"
            print(line)
        print("")
        return 1
    finally:
        process.SetNamespace(previous)
}

/// ObjectScript fallback used when Embedded Python is not usable.
ClassMethod ConfigureObjectScript(api As %String) As %Status
{
    New $Namespace
    Set $Namespace = "%SYS"
    If '##class(Security.Applications).Exists(api) {
        Write !, "Aperture: web application ", api, " not found; the portal needs IRIS 2026.2+ (SysAdmin API v2)"
        Return $$$OK
    }
    Do ##class(Security.Applications).Get(api, .p)
    Set p("Enabled") = 1
    // add password authentication (bit 32) to whatever is already enabled
    Set p("AutheEnabled") = $ZBOOLEAN(+$Get(p("AutheEnabled")), 32, 7)
    // JWT bearer tokens via POST /login, available from IRIS 2026.2
    If ##class(%Dictionary.CompiledProperty).%ExistsId("Security.Applications||JWTAuthEnabled") {
        Set p("JWTAuthEnabled") = 1
    }
    Set sc = ##class(Security.Applications).Modify(api, .p)
    Write !, "Aperture: configured ", api, " (ObjectScript): ", $Select(sc: "OK", 1: $System.Status.GetErrorText(sc))
    Return sc
}

}
