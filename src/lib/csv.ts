/**
 * CSV export (RFC 4180): CRLF line ends, fields quoted when they contain a comma, a quote
 * or a line break, quotes doubled. Strings that a spreadsheet would evaluate as a formula
 * (`=`, `+`, `-`, `@`, tab, CR) are prefixed with an apostrophe: audit records and process
 * names carry server-controlled text, and a CSV must never execute it.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
/** UTF-8 byte-order mark, so spreadsheets read accented text correctly. */
const BOM = String.fromCharCode(0xfeff);

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (typeof value === 'number' || typeof value === 'boolean') text = String(value);
  else if (typeof value === 'string') text = FORMULA_START.test(value) ? `'${value}` : value;
  else if (value instanceof Date) text = value.toISOString();
  else text = JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header row plus data rows; a UTF-8 byte-order mark makes spreadsheets read accents correctly. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return BOM + lines.join('\r\n') + '\r\n';
}
