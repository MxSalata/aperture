/// The test production of Aperture's live checks (scripts/live/lab.mjs loads it into the APERTURELAB namespace): a
/// service that sends a message every few seconds, a router, and operations that keep messages, refuse some on
/// purpose and work slowly, so the production screens have states, errors and a queue to show. Not part of the
/// iris-aperture package.
Class Aperture.Lab.Production Extends Ens.Production
{

XData ProductionDefinition
{
<Production Name="Aperture.Lab.Production" TestingEnabled="false" LogGeneralTraceEvents="false">
  <Description>Aperture's test production: a message every ten seconds, a host that refuses every other message, a slow host whose queue fills in bursts, and a disabled host.</Description>
  <ActorPoolSize>1</ActorPoolSize>
  <Item Name="Lab.Ticker" Category="Lab" ClassName="Aperture.Lab.TickService" PoolSize="1" Enabled="true" Foreground="false" Comment="Sends a message every ten seconds" LogTraceEvents="false" Schedule="">
    <Setting Target="Adapter" Name="CallInterval">10</Setting>
  </Item>
  <Item Name="Lab.Router" Category="Lab" ClassName="Aperture.Lab.Router" PoolSize="1" Enabled="true" Foreground="false" Comment="Archives every message, sends every third to Lab.Flaky and every eighth starts a burst for Lab.Slow" LogTraceEvents="false" Schedule="">
  </Item>
  <Item Name="Lab.Archive" Category="Lab" ClassName="Aperture.Lab.ArchiveOperation" PoolSize="1" Enabled="true" Foreground="false" Comment="Keeps every message" LogTraceEvents="false" Schedule="">
  </Item>
  <Item Name="Lab.Flaky" Category="Lab,Faults" ClassName="Aperture.Lab.FlakyOperation" PoolSize="1" Enabled="true" Foreground="false" Comment="Refuses every other message on purpose" LogTraceEvents="false" Schedule="">
  </Item>
  <Item Name="Lab.Slow" Category="Lab" ClassName="Aperture.Lab.SlowOperation" PoolSize="1" Enabled="true" Foreground="false" Comment="Three seconds per message, so a burst waits in its queue" LogTraceEvents="false" Schedule="">
  </Item>
  <Item Name="Lab.Spare" Category="Lab" ClassName="Aperture.Lab.ArchiveOperation" PoolSize="1" Enabled="false" Foreground="false" Comment="Disabled on purpose" LogTraceEvents="false" Schedule="">
  </Item>
</Production>
}

}
