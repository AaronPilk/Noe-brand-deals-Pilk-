#!/usr/bin/env node
/**
 * sync.mjs — pulls the authorized Google Sheet (link-shared, read-only) and refreshes data/source/,
 * then runs build-data.mjs. Run from the repo root: node scripts/sync.mjs
 *
 * Source of truth: Noe Varner brand-deal audit workbook.
 * This never writes to the sheet — read-only, one direction.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SHEET_ID = '1IWZvpytW8Rhn9rzcJaDcYMmlSw-ZgE1gCPFWBjAqEM4';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (f) => join(root, 'data', 'source', f);

const url = (tab, tq) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}` +
  (tq ? `&tq=${encodeURIComponent(tq)}` : '');

async function fetchCSV(tab, tq) {
  const res = await fetch(url(tab, tq), { redirect: 'follow' });
  if (!res.ok) throw new Error(`${tab}: HTTP ${res.status} — is the sheet still link-shared?`);
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error(`${tab}: got HTML instead of CSV — access likely revoked`);
  return text;
}

// ---------------------------------------------------------------------------
// SOURCE OF TRUTH is now this repo (data/source/ui-export.csv) — NOT the sheet.
// Pulling from the Google Sheet would OVERWRITE current deal data with a stale
// copy, so this script is disabled by default. New deals flow in from Gmail
// sweeps (Claude reads the inbox) + any DM deals you tell Claude to add; edit
// data/source/ui-export.csv directly, then run: node scripts/build-data.mjs
// If you truly need a one-time pull from the old sheet: node scripts/sync.mjs --from-sheet
// ---------------------------------------------------------------------------
if (!process.argv.includes('--from-sheet')) {
  console.error(
    '\n⛔ sync.mjs is disabled — the repo (data/source/ui-export.csv) is the source of truth now.' +
      '\n   Pulling the sheet would overwrite current deals with a stale copy.' +
      '\n   Add/edit deals in data/source/ui-export.csv, then: node scripts/build-data.mjs' +
      '\n   One-time emergency pull from the old sheet: node scripts/sync.mjs --from-sheet\n',
  );
  process.exit(1);
}

console.log('Syncing from Google Sheet…');

// UI Export is the normalized primary feed.
const uiExport = await fetchCSV('UI Export');
// Strip fully-empty trailing columns the sheet sometimes appends.
const cleaned = uiExport.split('\n').map((l) => l.replace(/(,"")+\s*$/, '')).join('\n');
writeFileSync(out('ui-export.csv'), cleaned);
console.log('  ✓ UI Export');

console.log(`
NOTE: drafts-config.json, followups.json, research.json, dashboard.json and ratecard.json
encode the other tabs in structured form. If those tabs change materially in the sheet,
regenerate them (or ask Claude in Cowork to re-sync them — it reads every tab).
`);

execFileSync(process.execPath, [join(root, 'scripts', 'build-data.mjs')], { stdio: 'inherit' });
console.log('Sync complete. Commit + push to deploy.');
