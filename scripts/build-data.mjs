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

// ---------- V2 VOICE PASS (Aaron's rules, 2026-07-20) ----------
// 1. Every reply sounds like Aaron personally. 2. No dashes of any kind.
// 3. Reply logic responds to what the brand actually said. 4. No dollar
// amounts unless the brand already put a number on the table (0016, 0017).
const NAME_MAP = {
  '0066': 'Gaurav', '0067': 'there', '0068': 'there', '0069': 'Thomas', '0070': 'Nick',
  '0071': 'there', '0072': 'there', '0073': 'there', '0074': 'Yvonne', '0075': 'Evelyn',
  '0076': 'Rachel', '0077': 'Palak', '0078': 'there', '0080': 'Iris', '0081': 'Brooke',
  '0082': 'there', '0083': 'Jackson', '0084': 'Bilal', '0085': 'Iris', '0086': 'there',
  '0087': 'there', '0088': 'Selina', '0089': 'Jay', '0090': 'Alex', '0091': 'Joyce', '0092': 'Villela'
};
for (const p of cfg.drafts) NAME_MAP[p.dealId.slice(-4)] = p.name;

const SIGN = '\n\nBest,\nAaron\nTalent Manager for Noe Varner';
const KIT = "You can see Noe's audience and past campaigns here: noevarner.com/partners";

function composeV2(dr, d) {
  const n = NAME_MAP[d.deal_id.slice(-4)] || 'there';
  const hi = `Hi ${n},`;
  const intro = "Aaron here. I manage Noe's brand partnerships, so pricing and scheduling run through me.";
  const rf = (d.red_flags || '').toLowerCase();
  const stale = Number(d.days_since_contact || 0) > 20 || d.status === 'Expired';
  const verify = /authoriz|mismatch|verify|impersonat|middleman|generic gmail|split payment|unverified|differs|unrelated/.test(rf) || /agency|conflict/i.test(d.key_questions || '') && /authoriz|official/i.test(d.key_questions || '');
  const rights = d.rights_flags && !/^none/i.test(d.rights_flags);
  const perpetual = /perpetual/i.test(d.rights_flags || '');
  const socialCat = /social cat/i.test(d.agency || '') || /thesocialcat/.test(d.contact_email || '');
  const whatsapp = /whatsapp|telegram/i.test(rf);
  const s = d.commercial_structure || '';
  const num2 = (x) => x == null || x === '' ? 0 : Number(x);

  const lines = [];
  lines.push(stale
    ? 'Coming back around on this thread. If the campaign already wrapped, I would still like to hear what is next on your side.'
    : `Noe took a look and ${d.brand.split(' (')[0]} sits right in the lane his audience shows up for.`);
  if (verify) lines.push('One thing before we get into scope. Can you confirm you are the authorized contact for this brand? Once that is squared away we can move quickly.');
  if (perpetual) lines.push('And to be straight with you up front, perpetual usage is not something Noe grants under a standard sponsorship. A fixed term license is workable, so tell me what window you actually need.');
  else if (rights) lines.push('You mentioned usage rights in your note. Those get scoped separately from the content itself, so spell out exactly what you need there.');
  if (whatsapp) lines.push('Also, let us keep everything on email so nothing gets lost.');
  if (socialCat) lines.push('This came through Social Cat, so tell me where you would rather I reply, in the platform or straight over email.');

  let ask;
  if (/Affiliate/i.test(s)) ask = 'Affiliate can work as a layer here, but content is scoped on its own. What commission are you offering, what is the attribution window, and is there budget for the content itself?';
  else if (/UGC/i.test(s)) ask = 'For content Noe produces that runs on your side, production and usage are two separate pieces. What are the specs, where will it run, and for how long?';
  else if (/Retainer|Ambassador/i.test(s)) ask = 'For ongoing work I scope by monthly deliverables and term. What does a month look like on your side, and what budget range are you working with?';
  else if (/Event|Advisory/i.test(s)) ask = 'For events and appearances I quote based on format, prep and time. Send the date, the format and the audience and I will come back with a number.';
  else if (/Paid-ad|Licensing/i.test(s)) ask = 'Since this content runs on your side, creation and the license are separate pieces. What platforms, what duration, and what budget are you working with?';
  else if (/Recurring|Representation/i.test(s)) ask = 'Before we talk numbers I need the shape of it. How many videos per month, who holds script and creative approval, what usage rights you expect, and how payment works on your end.';
  else ask = 'To put a real proposal together I need three things from you. The budget you are working with, the deliverables you want, and your timeline.';

  return `${hi}\n\n${intro}\n\n${lines.join(' ')}\n\n${ask}\n\n${KIT}\n\nSend that over and I will come back with a clear proposal.${SIGN}`;
}

const BESPOKE = {
  'NV-REPLY-0016': `Hi Suri,\n\nAaron here. I manage Noe's brand partnerships, so pricing runs through me.\n\nThanks for the offer. Here is the issue with it. The $250 covers a slice of the production, but the ask also includes 365 days of global ad usage, and those are two very different line items. A year of worldwide paid usage on Noe's content is worth several times the production itself.\n\nTwo ways to make this work. If the usage term matters most, tell me and I will quote the full package properly. If the $250 range is fixed, we trim the license down to a short window that actually matches it.\n\n${KIT}\n\nWhich way do you want to go?${SIGN}`,
  'NV-REPLY-0017': `Hi Ira,\n\nAaron here. I manage Noe's brand partnerships, so pricing runs through me.\n\nAppreciate you putting a number down. Straight answer though, $400 for the two video package is well under where Noe's content lands for AI marketing tools, especially with the usage attached.\n\nRyze is a strong fit for his audience, so I want to make this work. Tell me the ceiling on your side and I will shape the scope to fit it, or we keep your two videos and revisit the number together.\n\n${KIT}${SIGN}`,
  'NV-REPLY-0074': 'Hey Abylay, good to hear from the Higgsfield side directly. Quick check before we go further. I may already be lined up on a Higgsfield campaign through Heek and BDSJ, so can you confirm whether your Claude MCP campaign is the same thing or separate? Want to make sure we are not crossing wires on scope or rates. Once that is clear I will send over a proposal.',
  'NV-REPLY-0075': 'Hey Felipe, locked in for the session, Jul 16 or 21 both work. On the paid collab side let us talk specifics right after. Bring what you are picturing for scope, timing and budget and we will shape it from there. Looking forward to it.'
};

function composeDmV2(dr, d) {
  const n = NAME_MAP[d.deal_id.slice(-4)] || 'there';
  const rf = (d.red_flags || '').toLowerCase();
  const verify = /authoriz|mismatch|verify|middleman|split payment|differs|unrelated/.test(rf);
  const aff = /Affiliate/i.test(d.commercial_structure || '');
  const rep = /Representation/i.test(d.commercial_structure || '');
  let mid;
  if (rep) mid = 'I am selective on representation, so tell me your commission structure, which brands you actively place, and what you would commit to in the first 90 days.';
  else if (aff) mid = 'Affiliate can work as a layer, but posted content is priced on its own. Send the commission terms and whether there is budget for the content itself.';
  else mid = 'What budget are you working with, what exactly do you want made, and what is the timeline?';
  return `Hey ${n}, Aaron here, I run Noe's brand partnerships so deals go through me. ${verify ? 'First, confirm you are the authorized contact for the brand and we can move fast. ' : ''}${mid} Audience details are at noevarner.com/partners`;
}

for (const dr of drafts) {
  const d = byId[dr.dealId];
  if (!d) continue;
  if (BESPOKE[dr.id]) dr.body = BESPOKE[dr.id];
  else if (/decline/i.test(dr.responseType)) dr.body = `Hi ${NAME_MAP[d.deal_id.slice(-4)] || 'there'},\n\nAaron here. I manage Noe's brand partnerships.\n\nThanks for thinking of Noe on this one. It is not the right fit for his audience and content focus right now, so we will pass. I appreciate the outreach though, and if something closer to AI and business tools comes up down the line I would be glad to hear from you.${SIGN}`;
  else if (dr.channel === 'dm') dr.body = composeDmV2(dr, d);
  else dr.body = composeV2(dr, d);
  dr.subject = (dr.subject || '').replace(/\s*[—–]\s*/g, ' x ');
  dr.voice = 'v2-aaron';
}

// V2 assertions: no dashes anywhere, dollars only where the brand made an offer
for (const dr of drafts) {
  if (/[—–]/.test(dr.body) || /(^|\s)-(\s|$)/.test(dr.body)) { console.error(`${dr.id}: dash found`); process.exit(1); }
  if (dr.body.includes('$') && !['NV-REPLY-0016', 'NV-REPLY-0017'].includes(dr.id)) { console.error(`${dr.id}: unprompted dollar amount`); process.exit(1); }
}

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
