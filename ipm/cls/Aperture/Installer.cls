/// Post-install hook for the iris-aperture IPM package.
/// Makes sure the SysAdmin REST API (/api/admin) is enabled with password and
/// JWT authentication so the portal can sign in straight after `zpm "install iris-aperture"`.
Class Aperture.Installer
{

/// Called by IPM (see module.xml <Invoke>).
ClassMethod Configure() As %Status
{
    New $Namespace
    Set $Namespace = "%SYS"
    Set app = "/api/admin"
    If '##class(Security.Applications).Exists(app) {
        Write !, "Aperture: web application ", app, " not found on this IRIS version; the portal needs IRIS 2025.1+ with the SysAdmin API."
        Quit $$$OK
    }
    Do ##class(Security.Applications).Get(app, .p)
    Set p("Enabled") = 1
    // add password authentication (bit 32) to whatever is already enabled
    Set p("AutheEnabled") = $ZBOOLEAN(+$Get(p("AutheEnabled")), 32, 7)
    // JWT bearer tokens via POST /login - available from IRIS 2026.2
    Set p("JWTAuthEnabled") = 1
    Set sc = ##class(Security.Applications).Modify(app, .p)
    Write !, "Aperture: configured ", app, " - ", $Select(sc: "OK", 1: $System.Status.GetErrorText(sc))
    Write !, "Aperture: open http://<host>:52773/aperture/ and sign in with an account holding %Admin_* privileges."
    Quit sc
}

}
