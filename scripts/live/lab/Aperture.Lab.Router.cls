Include Ensemble

/// Passes every message to Lab.Archive, every third to Lab.Flaky, and on every eighth sends a burst of five to
/// Lab.Slow. Answers nothing: every send is asynchronous and wants no response.
Class Aperture.Lab.Router Extends Ens.BusinessProcess
{

Method OnRequest(pRequest As Ens.StringRequest, Output pResponse As Ens.StringResponse) As %Status
{
    Set n = +$Piece(pRequest.StringValue, " ", 2)
    Set sc = ..SendRequestAsync("Lab.Archive", pRequest, 0)
    If $$$ISERR(sc) Quit sc
    If n # 3 = 0 {
        Set sc = ..SendRequestAsync("Lab.Flaky", pRequest, 0)
        If $$$ISERR(sc) Quit sc
    }
    If n # 8 = 0 {
        For i = 1:1:5 {
            Set burst = ##class(Ens.StringRequest).%New()
            Set burst.StringValue = pRequest.StringValue_" burst "_i
            Set sc = ..SendRequestAsync("Lab.Slow", burst, 0)
            If $$$ISERR(sc) Quit
        }
    }
    Quit sc
}

}
