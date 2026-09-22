import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../csv';

describe('csv export', () => {
  it('quotes fields with separators, quotes and line breaks (RFC 4180)', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(true)).toBe('true');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
  it('neutralises spreadsheet formulas in server-controlled text', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('+1234')).toBe("'+1234");
    expect(csvCell('@import')).toBe("'@import");
    expect(csvCell('-5 degrees')).toBe("'-5 degrees");
    expect(csvCell(-5)).toBe('-5');
  });
  it('writes a BOM, a header row and CRLF line ends', () => {
    expect(toCsv(['Name', 'PID'], [['jdoe', 1234], ['sys', null]])).toBe('﻿Name,PID\r\njdoe,1234\r\nsys,\r\n');
  });
});
