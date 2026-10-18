Include Ensemble

/// Sends an Ens.StringRequest ("tick N") to Lab.Router each time the adapter calls it (CallInterval).
Class Aperture.Lab.TickService Extends Ens.BusinessService
{

Parameter ADAPTER = "Ens.InboundAdapter";

Property Count As %Integer [ InitialExpression = 0 ];

Method OnProcessInput(pInput As %RegisteredObject, Output pOutput As %RegisteredObject) As %Status
{
    Set ..Count = ..Count + 1
    Set request = ##class(Ens.StringRequest).%New()
    Set request.StringValue = "tick "_..Count
    Quit ..SendRequestAsync("Lab.Router", request)
}

}
