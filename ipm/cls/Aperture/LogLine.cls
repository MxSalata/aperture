/// One indexed entry of messages.log or of one of its rotations: where it is, when it was
/// written, what it says, and the vector of its wording, which Aperture.LogIndex computes with
/// ipm/python/aperture_vectors.py and Aperture.API's /logs/similar searches with VECTOR_COSINE
/// over the HNSW index. The package writes to this table and to Aperture.LogIndexFile, and to
/// nothing else of the instance.
Class Aperture.LogLine Extends %Persistent
{

/// The catalogue id of the file (its name), as GET /api/aperture/logs lists it.
Property LogFile As %String(MAXLEN = 128) [ Required ];

/// Byte offset of the entry's stamped line in the file: with the file, the entry's identity.
Property ByteOffset As %Integer [ Required ];

/// The stamp, YYYY-MM-DD HH:MM:SS on the instance's clock. (Names that are not SQL reserved words: Stamp, Entry, LogFile, ByteOffset.)
Property Stamp As %String(MAXLEN = 19);

/// 0 information, 1 warning, 2 severe, 3 fatal.
Property Severity As %Integer;

Property Category As %String(MAXLEN = 64);

/// The raw entry: the stamped line and the lines that continued it, capped.
Property Entry As %String(MAXLEN = 2000);

/// The template the vector was made of (lower-cased words, <n>, <h>, <path>), capped.
Property Template As %String(MAXLEN = 1000);

/// The wording vector: 256 doubles of unit length.
Property Embedding As %Library.Vector(DATATYPE = "DOUBLE", LEN = 256);

Index FileOffset On (LogFile, ByteOffset) [ Unique ];

/// Approximate nearest neighbours by cosine similarity, for
/// SELECT TOP k ... ORDER BY VECTOR_COSINE(Embedding, TO_VECTOR(?, DOUBLE, 256)) DESC.
Index Wording On (Embedding) As %SQL.Index.HNSW(Distance = "Cosine");

}
