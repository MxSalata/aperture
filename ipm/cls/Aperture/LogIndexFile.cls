/// The watermark of one indexed log file: how far Aperture.LogIndex has read it, and a
/// signature of its first bytes so that a rotation (another file under the same name) or a
/// truncation is noticed and the file's entries are indexed afresh.
Class Aperture.LogIndexFile Extends %Persistent
{

/// The catalogue id of the file (its name).
Property LogFile As %String(MAXLEN = 128) [ Required ];

Index FileIdx On LogFile [ Unique ];

Property Path As %String(MAXLEN = 512);

/// SHA-256, hexadecimal, of the file's first 512 bytes.
Property Signature As %String(MAXLEN = 64);

/// Bytes indexed from the start of the file; the next refresh reads on from here.
Property IndexedTo As %Integer [ InitialExpression = 0 ];

/// The file's size when it was last read.
Property Bytes As %Integer [ InitialExpression = 0 ];

/// Entries indexed from this file.
Property Lines As %Integer [ InitialExpression = 0 ];

/// When the watermark last moved, YYYY-MM-DD HH:MM:SS on the instance's clock.
Property IndexedAt As %String(MAXLEN = 19);

}
