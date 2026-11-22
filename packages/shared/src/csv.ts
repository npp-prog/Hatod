import { isInPhilippines } from './geo';

export interface BarangayCsvRow {
  line: number;
  name: string;
  lat: number;
  lng: number;
}

export interface CsvIssue {
  line: number;
  code: 'missing_header' | 'bad_columns' | 'empty_name' | 'name_too_long' | 'bad_coordinates' | 'duplicate_name' | 'too_many_rows';
}

export const MAX_BARANGAY_ROWS = 300;

/** Splits one CSV line, honouring double quotes ("Sto. Niño, Pob."). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parses a barangay list: header `name,lat,lng` (any order, case-insensitive),
 * then one barangay per line. Returns the valid rows and a list of issues by
 * line number; a file with issues can still import its valid rows.
 */
export function parseBarangayCsv(text: string): { rows: BarangayCsvRow[]; issues: CsvIssue[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const rows: BarangayCsvRow[] = [];
  const issues: CsvIssue[] = [];

  const headerIdx = lines.findIndex((l) => l.trim() !== '');
  if (headerIdx < 0) return { rows, issues: [{ line: 1, code: 'missing_header' }] };
  const header = splitCsvLine(lines[headerIdx]!).map((h) => h.toLowerCase());
  const col = {
    name: header.indexOf('name'),
    lat: header.findIndex((h) => h === 'lat' || h === 'latitude'),
    lng: header.findIndex((h) => h === 'lng' || h === 'lon' || h === 'long' || h === 'longitude'),
  };
  if (col.name < 0 || col.lat < 0 || col.lng < 0) {
    return { rows, issues: [{ line: headerIdx + 1, code: 'missing_header' }] };
  }

  const seen = new Set<string>();
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;
    const line = i + 1;
    if (rows.length >= MAX_BARANGAY_ROWS) {
      issues.push({ line, code: 'too_many_rows' });
      break;
    }
    const cells = splitCsvLine(raw);
    if (cells.length < header.length) {
      issues.push({ line, code: 'bad_columns' });
      continue;
    }
    const name = cells[col.name]!.replace(/\s+/g, ' ');
    const lat = Number(cells[col.lat]);
    const lng = Number(cells[col.lng]);
    if (!name) {
      issues.push({ line, code: 'empty_name' });
      continue;
    }
    if (name.length > 80) {
      issues.push({ line, code: 'name_too_long' });
      continue;
    }
    if (cells[col.lat] === '' || cells[col.lng] === '' || !isInPhilippines({ lat, lng })) {
      issues.push({ line, code: 'bad_coordinates' });
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      issues.push({ line, code: 'duplicate_name' });
      continue;
    }
    seen.add(key);
    rows.push({ line, name, lat, lng });
  }
  return { rows, issues };
}
