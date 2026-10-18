Include Ensemble

/// Keeps every message: logs it and answers.
Class Aperture.Lab.ArchiveOperation Extends Ens.BusinessOperation
{

Parameter INVOCATION = "Queue";

Method Keep(pRequest As Ens.StringRequest, Output pResponse As Ens.StringResponse) As %Status
{
    $$$LOGINFO("Archived "_pRequest.StringValue)
    Set pResponse = ##class(Ens.StringResponse).%New()
    Set pResponse.StringValue = "archived"
    Quit $$$OK
}

XData MessageMap
{
<MapItems>
  <MapItem MessageType="Ens.StringRequest"><Method>Keep</Method></MapItem>
</MapItems>
}

}
