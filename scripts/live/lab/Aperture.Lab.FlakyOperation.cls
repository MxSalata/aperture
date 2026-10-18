Include Ensemble

/// Refuses every other message with an error, so the event log and the host's status have errors to show.
Class Aperture.Lab.FlakyOperation Extends Ens.BusinessOperation
{

Parameter INVOCATION = "Queue";

Property Seen As %Integer [ InitialExpression = 0 ];

Method Deliver(pRequest As Ens.StringRequest, Output pResponse As Ens.StringResponse) As %Status
{
    Set ..Seen = ..Seen + 1
    If ..Seen # 2 = 0 Quit $$$ERROR($$$GeneralError, "Downstream system refused "_pRequest.StringValue)
    Set pResponse = ##class(Ens.StringResponse).%New()
    Set pResponse.StringValue = "delivered"
    Quit $$$OK
}

XData MessageMap
{
<MapItems>
  <MapItem MessageType="Ens.StringRequest"><Method>Deliver</Method></MapItem>
</MapItems>
}

}
