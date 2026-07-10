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
