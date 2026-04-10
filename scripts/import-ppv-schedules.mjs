#!/usr/bin/env node
/**
 * Import PPV schedules from Google Sheets into SQLite
 * 
 * Usage:
 *   node scripts/import-ppv-schedules.mjs
 *   node scripts/import-ppv-schedules.mjs --dry-run
 * 
 * Google Sheet: https://docs.google.com/spreadsheets/d/1pWRzjSWD__MfayNQjUuYikeSUY4c3Qj2UD7amRSezRI
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { resolve } from 'path';

const SHEET_ID = '1pWRzjSWD__MfayNQjUuYikeSUY4c3Qj2UD7amRSezRI';
const GID = '0';
const DB_PATH = resolve(process.cwd(), 'data/app.db');
const DRY_RUN = process.argv.includes('--dry-run');

function parseDate(dateStr, timeStr) {
  const months = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const dm = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/);
  const tm = (timeStr || '12:00 PM').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!dm || !tm) return null;
  let hour = parseInt(tm[1]);
  const min = parseInt(tm[2]);
  const ampm = tm[3].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return new Date(parseInt(dm[3]), months[dm[2]], parseInt(dm[1]), hour, min);
}

function normalizeStatus(s) {
  const low = (s || '').trim().toLowerCase();
  if (low === 'completed' || low === 'complete') return 'completed';
  if (low === 'cancelled' || low === 'canceled') return 'cancelled';
  if (low === 'live') return 'live';
  return 'upcoming';
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

async function main() {
  console.log('📋 PPV Schedule Import from Google Sheets');
  console.log(`   Sheet: https://docs.google.com/spreadsheets/d/${SHEET_ID}`);
  console.log(`   DB:    ${DB_PATH}`);
  if (DRY_RUN) console.log('   Mode:  DRY RUN (no changes)\n');
  else console.log('');

  if (!existsSync(DB_PATH)) {
    console.error('❌ Database not found at', DB_PATH);
    process.exit(1);
  }

  console.log('⬇️  Fetching sheet...');
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const res = await fetch(url);
  if (!res.ok) { console.error(`❌ Failed to fetch: ${res.status}`); process.exit(1); }
  const csv = await res.text();
  const lines = csv.split('\n');

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('ID') && lines[i].includes('Date') && lines[i].includes('Match Details')) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) { console.error('❌ Header row not found'); process.exit(1); }

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const id = cols[0]?.trim();
    const dateStr = cols[2]?.trim();
    const matchDetails = cols[3]?.trim();
    const game = cols[4]?.trim();
    const timeStr = cols[8]?.trim();
    const status = cols[9]?.trim();
    const bclAccount = cols[10]?.trim() || '';
    const note = cols[11]?.trim() || '';
    if (!id || !dateStr || !matchDetails) continue;
    const dt = parseDate(dateStr, timeStr);
    if (!dt) { console.warn(`⚠️  ${id}: bad date "${dateStr} ${timeStr}"`); continue; }
    rows.push({ id, match_datetime: Math.floor(dt.getTime() / 1000), match_details: matchDetails, category: game || 'Other', status: normalizeStatus(status), bcl_account: bclAccount, pic: '', remark: note });
  }

  console.log(`📊 Found ${rows.length} rows\n`);

  if (DRY_RUN) {
    rows.forEach(r => {
      const dt = new Date(r.match_datetime * 1000);
      console.log(`   ${r.id} | ${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} | ${r.match_details} | ${r.category} | ${r.status}`);
    });
    console.log('\n✅ Dry run done. Remove --dry-run to import.');
    return;
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS ppv_schedules (id TEXT PRIMARY KEY, match_datetime INTEGER NOT NULL, match_details TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Liga Super', status TEXT NOT NULL DEFAULT 'upcoming', bcl_account TEXT DEFAULT '', pic TEXT DEFAULT '', remark TEXT DEFAULT '', created_at INTEGER, updated_at INTEGER)`);

  const now = Math.floor(Date.now() / 1000);
  const upsert = db.prepare(`INSERT INTO ppv_schedules (id, match_datetime, match_details, category, status, bcl_account, pic, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET match_datetime=excluded.match_datetime, match_details=excluded.match_details, category=excluded.category, status=excluded.status, bcl_account=excluded.bcl_account, remark=excluded.remark, updated_at=excluded.updated_at`);

  const run = db.transaction((items) => {
    let ins = 0, upd = 0;
    for (const r of items) {
      const exists = db.prepare('SELECT 1 FROM ppv_schedules WHERE id = ?').get(r.id);
      upsert.run(r.id, r.match_datetime, r.match_details, r.category, r.status, r.bcl_account, r.pic, r.remark, now, now);
      if (exists) upd++; else ins++;
    }
    return { ins, upd };
  });

  const result = run(rows);
  console.log(`✅ Done! New: ${result.ins}, Updated: ${result.upd}, Total: ${rows.length}`);
  db.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
