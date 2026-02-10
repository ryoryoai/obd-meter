import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const SHEET_ID = '1Mmlb-SHATQBuTa_3tORdKQatSbvdIouEdMZcasXJghk';
const SHEET_NAME = 'Metric';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

// Minimal CSV parser (quotes + commas). Good enough for this sheet.
function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }

    if (ch === '\r') {
      i++;
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function jsStringLiteral(value) {
  return JSON.stringify(String(value ?? ''));
}

function toNumberOrZero(v) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const csv = await fetch(CSV_URL);
  const rows = parseCsv(csv);

  if (rows.length < 2) {
    throw new Error('CSV had no rows');
  }

  const header = rows[0];
  const idx = {
    name: header.indexOf('Name'),
    shortName: header.indexOf('ShortName'),
    modeAndPid: header.indexOf('ModeAndPID'),
    equation: header.indexOf('Equation'),
    min: header.indexOf('Min Value'),
    max: header.indexOf('Max Value'),
    units: header.indexOf('Units'),
    header: header.indexOf('Header'),
  };

  for (const [k, v] of Object.entries(idx)) {
    if (v === -1) {
      throw new Error(`Missing CSV column: ${k}`);
    }
  }

  const items = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = row[idx.name] ?? '';
    const shortName = row[idx.shortName] ?? '';
    const modeAndPid = String(row[idx.modeAndPid] ?? '').trim().toUpperCase();
    const equation = row[idx.equation] ?? '';
    const min = toNumberOrZero(row[idx.min]);
    const max = toNumberOrZero(row[idx.max]);
    const units = row[idx.units] ?? '';
    const hdr = String(row[idx.header] ?? '').trim().toUpperCase();

    if (!/^[0-9A-F]{4,}$/.test(modeAndPid) || modeAndPid.length % 2 !== 0) {
      // Skip malformed row (should not happen).
      continue;
    }
    if (!/^[0-9A-F]{3,}$/.test(hdr)) {
      continue;
    }

    items.push({ name, shortName, modeAndPid, equation, min, max, units, header: hdr });
  }

  const today = new Date().toISOString().slice(0, 10);
  const outPath = path.join(process.cwd(), 'src', 'obd', 'pid', 'priuschatMetric.ts');

  const lines = [];
  lines.push('/* eslint-disable */');
  lines.push('/**');
  lines.push(' * GENERATED FILE - DO NOT EDIT MANUALLY.');
  lines.push(' *');
  lines.push(' * Source: PriusChat custom PIDs spreadsheet (Vincent1449p) - Metric sheet.');
  lines.push(` * Sheet: ${SHEET_NAME}`);
  lines.push(` * URL: ${CSV_URL}`);
  lines.push(` * Retrieved: ${today}`);
  lines.push(' *');
  lines.push(' * To regenerate: node scripts/generate-priuschat-metric.mjs');
  lines.push(' */');
  lines.push('');
  lines.push("import type { PidDefinition } from '../../types/obd';");
  lines.push("import { compileTorqueEquation } from '../torqueEquation';");
  lines.push('');
  lines.push('export interface PriusChatMetricRow {');
  lines.push('  name: string;');
  lines.push('  shortName: string;');
  lines.push('  modeAndPid: string;');
  lines.push('  equation: string;');
  lines.push('  min: number;');
  lines.push('  max: number;');
  lines.push('  units: string;');
  lines.push('  header: string;');
  lines.push('}');
  lines.push('');
  lines.push('export const PRIUSCHAT_METRIC_ROWS: PriusChatMetricRow[] = [');
  for (const it of items) {
    lines.push('  {');
    lines.push(`    name: ${jsStringLiteral(it.name)},`);
    lines.push(`    shortName: ${jsStringLiteral(it.shortName)},`);
    lines.push(`    modeAndPid: ${jsStringLiteral(it.modeAndPid)},`);
    lines.push(`    equation: ${jsStringLiteral(it.equation)},`);
    lines.push(`    min: ${it.min},`);
    lines.push(`    max: ${it.max},`);
    lines.push(`    units: ${jsStringLiteral(it.units)},`);
    lines.push(`    header: ${jsStringLiteral(it.header)},`);
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');
  lines.push('function sanitizeIdPart(input: string): string {');
  lines.push('  const s = String(input ?? \'\').trim().toUpperCase();');
  lines.push('  const cleaned = s.replace(/[^A-Z0-9]+/g, \'_\').replace(/^_+|_+$/g, \'\');');
  lines.push('  return cleaned.length > 0 ? cleaned : \'X\';');
  lines.push('}');
  lines.push('');
  lines.push('export const PRIUSCHAT_METRIC_PIDS: Record<string, PidDefinition> = (() => {');
  lines.push('  const out: Record<string, PidDefinition> = {};');
  lines.push('  for (const row of PRIUSCHAT_METRIC_ROWS) {');
  lines.push('    const baseId = `PC_${row.header}_${row.modeAndPid}_${sanitizeIdPart(row.shortName)}`;');
  lines.push('    let pid = baseId;');
  lines.push('    let n = 2;');
  lines.push('    while (out[pid]) {');
  lines.push('      pid = `${baseId}_${n++}`;');
  lines.push('    }');
  lines.push('');
  lines.push('    out[pid] = {');
  lines.push('      pid,');
  lines.push('      request: row.modeAndPid,');
  lines.push('      header: row.header,');
  lines.push('      name: row.name,');
  lines.push('      shortName: row.shortName,');
  lines.push('      unit: row.units,');
  lines.push('      min: row.min,');
  lines.push('      max: row.max,');
  lines.push('      decode: compileTorqueEquation(row.equation),');
  lines.push('    };');
  lines.push('  }');
  lines.push('  return out;');
  lines.push('})();');
  lines.push('');
  lines.push('export const PRIUSCHAT_METRIC_PID_IDS = Object.keys(PRIUSCHAT_METRIC_PIDS);');
  lines.push('');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Wrote ${items.length} rows to ${outPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

