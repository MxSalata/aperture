Include Ensemble

/// Takes three seconds per message, so a burst from Lab.Router waits in its queue.
Class Aperture.Lab.SlowOperation Extends Ens.BusinessOperation
{

Parameter INVOCATION = "Queue";

Method Work(pRequest As Ens.StringRequest, Output pResponse As Ens.StringResponse) As %Status
{
    Hang 3
    Set pResponse = ##class(Ens.StringResponse).%New()
    Set pResponse.StringValue = "done"
    Quit $$$OK
}

XData MessageMap
{
<MapItems>
  <MapItem MessageType="Ens.StringRequest"><Method>Work</Method></MapItem>
</MapItems>
}

}
