#!/usr/bin/env node
/**
 * build-data.mjs — compiles data/source/* into data/nv-data.js (window.NV_DATA).
 * Pure local file processing; no network. Run: node scripts/build-data.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => join(root, 'data', 'source', f);

// ---------- CSV parser (handles quoted fields, embedded newlines/commas) ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------- Deals ----------
const NUM = new Set(['total_score','explicit_cash_usd','market_value_base_usd','likely_close_usd','close_probability','prob_weighted_usd','hidden_rights_usd','days_since_contact','minimum_package_value','organic_posting_fee','production_fee','licensing_fee','paid_usage_fee','exclusivity_fee','total_recommended_opening_ask','minimum_acceptable_close']);
const rows = parseCSV(readFileSync(src('ui-export.csv'), 'utf8'));
const header = rows[0];
const deals = rows.slice(1).map((r) => {
  const d = {};
  header.forEach((h, i) => {
    if (!h) return;
    const v = r[i] ?? '';
    d[h] = NUM.has(h) ? (v === '' ? null : Number(v)) : v;
  });
  return d;
});

// ---------- ManyChat audit (loaded early: needed for channel derivation) ----------
const manychat = JSON.parse(readFileSync(src('manychat.json'), 'utf8'));
const mcByDeal = {};
for (const mc of manychat.records) {
  if (mc.linkedDealId) (mcByDeal[mc.linkedDealId] = mcByDeal[mc.linkedDealId] || []).push(mc.id);
  if (mc.relatedDealId) (mcByDeal[mc.relatedDealId] = mcByDeal[mc.relatedDealId] || []).push(mc.id);
}

// Source-channel derivation: the sheet stores 'Instagram DM via ManyChat' in the
// gmail_thread_url column for DM-only deals; email deals have a Gmail URL.
// Email deals enriched by a linked ManyChat conversation are 'both'.
for (const d of deals) {
  const dm = d.gmail_thread_url === 'Instagram DM via ManyChat';
  const email = /^https?:\/\//.test(d.gmail_thread_url || '');
  // Only LINKED conversations count as enrichment; 'related' possible-duplicate
  // approaches (e.g. Dreamina intermediaries) surface as context, not as a channel.
  const enriched = manychat.records.some((m) => m.linkedDealId === d.deal_id);
  d.source_channel = dm ? 'manychat' : email && enriched ? 'both' : email ? 'email' : 'unknown';
  d.manychat_ids = mcByDeal[d.deal_id] || [];
  if (dm) d.gmail_thread_url = ''; // not a real URL; channel now captured in source_channel
}

// Validation — fail loudly on structural problems, warn visibly on soft issues
const ids = deals.map((d) => d.deal_id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
const errors = [];
const warnings = [];
if (deals.length !== 92) errors.push(`Expected 92 deals, got ${deals.length}`);
const maxId = ids.map((i) => +i.slice(-4)).sort((a, b) => b - a)[0];
if (maxId !== 92) errors.push(`Max deal id NV-DEAL-00${maxId}, expected NV-DEAL-0092`);
if (dupes.length) errors.push(`Duplicate deal ids: ${dupes.join(', ')}`);
for (const d of deals) {
  if (!/^NV-DEAL-\d{4}$/.test(d.deal_id)) errors.push(`Bad id: ${d.deal_id}`);
  if (d.close_probability != null && d.close_probability > 1) errors.push(`${d.deal_id}: probability > 1`);
  if (d.likely_close_usd != null && d.close_probability != null && d.prob_weighted_usd != null) {
    const pw = Math.round(d.likely_close_usd * d.close_probability);
    if (Math.abs(pw - d.prob_weighted_usd) > 1) errors.push(`${d.deal_id}: prob_weighted mismatch (${pw} vs ${d.prob_weighted_usd})`);
  }
  if (d.source_channel === 'unknown') warnings.push(`${d.deal_id}: no email thread and no ManyChat link — source unknown`);
  if (d.source_channel === 'manychat' && d.prob_weighted_usd == null) { /* expected: DM deals not yet valued */ }
}
// Dedupe guards for enriched records — one deal, one valuation
for (const id of ['NV-DEAL-0019', 'NV-DEAL-0047']) {
  if (ids.filter((x) => x === id).length !== 1) errors.push(`${id} must appear exactly once (enriched, not duplicated)`);
}
// Dreamina intermediaries must not carry pipeline ids/value
for (const mc of manychat.records) {
  if (mc.classification === 'Possible Duplicate' && mc.linkedDealId) errors.push(`${mc.id}: possible duplicate must not create a pipeline id`);
}
if (errors.length) { console.error('VALIDATION FAILED:\n' + errors.join('\n')); process.exit(1); }
if (warnings.length) console.warn('WARNINGS (shown in Data Health):\n' + warnings.join('\n'));

// ---------- Drafts (templates + params -> full bodies, verbatim vs sheet) ----------
const cfg = JSON.parse(readFileSync(src('drafts-config.json'), 'utf8'));
const byId = Object.fromEntries(deals.map((d) => [d.deal_id, d]));
const drafts = cfg.drafts.map((p) => {
  const t = cfg.templates[p.template];
  const deal = byId[p.dealId];
  const brand = deal ? deal.brand : '';
  const body = (t.prefix || '') + t.body.replaceAll('{name}', p.name) + cfg.signature;
  return {
    id: p.id, dealId: p.dealId, brand,
    recipient: deal ? deal.contact_email : '',
    responseType: t.label,
    subject: t.subject.replaceAll('{brand}', brand),
    body,
    doNotSendUntil: cfg.doNotSendUntil,
    templateKey: p.template,
    channel: 'email',
    exception: p.template === 'exception'
  };
}).concat((cfg.rawDrafts || []).map((r) => ({
  id: r.id, dealId: r.dealId, brand: byId[r.dealId] ? byId[r.dealId].brand : '',
  recipient: r.recipient, responseType: r.responseType, subject: r.subject,
  body: r.body, doNotSendUntil: r.doNotSendUntil, templateKey: null,
  channel: r.channel, exception: false
})));
if (drafts.length !== 90) { console.error(`Expected 90 drafts (80 email + 10 DM), got ${drafts.length}`); process.exit(1); }

// ---------- Follow-ups (join with deals) ----------
const fu = JSON.parse(readFileSync(src('followups.json'), 'utf8'));
const followups = fu.queue.map((q) => {
  const d = byId[q.dealId];
  return { dealId: q.dealId, brand: d.brand, priority: d.priority, grade: d.grade, days: d.days_since_contact, timing: q.timing, action: d.recommended_action, gmail: d.gmail_thread_url, channel: d.source_channel, manychatIds: d.manychat_ids };
});
if (followups.length !== 83) { console.error(`Expected 83 follow-ups (75 email + 8 DM), got ${followups.length}`); process.exit(1); }

const research = JSON.parse(readFileSync(src('research.json'), 'utf8'));
const dashboard = JSON.parse(readFileSync(src('dashboard.json'), 'utf8'));
const ratecard = JSON.parse(readFileSync(src('ratecard.json'), 'utf8'));
const active = JSON.parse(readFileSync(src('active-deals.json'), 'utf8'));
for (const a of active.deals) {
  if (a.amount != null && a.received != null && a.received > a.amount) { console.error(`ACTIVE ${a.brand}: received > amount`); process.exit(1); }
}

const NV_DATA = {
  meta: {
    builtAt: new Date().toISOString(),
    recordVersion: dashboard.recordVersion,
    sourceSyncedAt: dashboard.syncedAt,
    sourceSheet: dashboard.sourceSheet,
    dealCount: deals.length,
    draftCount: drafts.length,
    followupCount: followups.length,
    researchCount: research.brands.length,
    activeDealCount: active.deals.length,
    activeSyncedAt: active.syncedAt,
    manychatCount: manychat.records.length,
    manychatSyncedAt: manychat.syncedAt,
    channels: {
      email: deals.filter((d) => d.source_channel === 'email').length,
      manychat: deals.filter((d) => d.source_channel === 'manychat').length,
      both: deals.filter((d) => d.source_channel === 'both').length
    },
    backupTabsIgnored: true,
    validation: 'passed',
    warnings
  },
  deals, drafts, followups,
  research: research.brands,
  dashboard, ratecard,
  active,
  manychat
};

writeFileSync(join(root, 'data', 'nv-data.js'), '// GENERATED by scripts/build-data.mjs — do not edit by hand.\nwindow.NV_DATA = ' + JSON.stringify(NV_DATA, null, 1) + ';\n');
console.log(`OK: ${deals.length} deals, ${drafts.length} drafts, ${followups.length} follow-ups, ${research.brands.length} researched brands -> data/nv-data.js`);
