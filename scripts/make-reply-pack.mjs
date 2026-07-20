#!/usr/bin/env node
/* make-reply-pack.mjs — renders reply-pack.html from data/nv-data.js so the
 * Gmail staging session (Claude in Chrome) can read final v2 bodies.
 * Run after build-data: node scripts/make-reply-pack.mjs */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'data', 'nv-data.js'), 'utf8');
const NV = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf(';')));

const byId = Object.fromEntries(NV.deals.map((d) => [d.deal_id, d]));
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const SKIP_SEND = new Set(['NV-DEAL-0039']); // sales pitch, archive per audit
const isSocialCat = (d) => /thesocialcat/.test(d.contact_email || '');

const email = [], platform = [], dm = [];
for (const dr of NV.drafts) {
  const d = byId[dr.dealId];
  if (!d || SKIP_SEND.has(dr.dealId)) continue;
  if (dr.channel === 'dm') dm.push({ dr, d });
  else if (isSocialCat(d)) platform.push({ dr, d });
  else email.push({ dr, d });
}

const block = ({ dr, d }, i) => `
<article>
  <h3>${i + 1}. ${esc(dr.id)} · ${esc(d.brand)}</h3>
  <p class="meta">Deal ${esc(d.deal_id)} · To: ${esc(dr.recipient)}${d.gmail_thread_url ? ` · <a href="${esc(d.gmail_thread_url)}">Open thread</a>` : ''}</p>
  <pre>${esc(dr.body)}</pre>
</article>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reply Pack — v2 voice (${new Date().toISOString().slice(0, 10)})</title>
<style>body{font-family:-apple-system,sans-serif;max-width:820px;margin:0 auto;padding:32px 20px;background:#f5f5f7;color:#1d1d1f}
h1{font-size:22px}h2{margin-top:40px;border-bottom:1px solid #ddd;padding-bottom:6px}h3{margin:26px 0 4px;font-size:15px}
.meta{font-size:12px;color:#6e6e73;margin:0 0 6px}pre{white-space:pre-wrap;background:#fff;border:1px solid #e2e2e6;border-radius:10px;padding:14px;font:13.5px/1.5 -apple-system,sans-serif}
.warn{background:#fff4e5;border:1px solid #f0c98a;border-radius:10px;padding:12px 16px;font-size:13.5px}</style></head><body>
<h1>Reply Pack — final v2 bodies (${email.length} Gmail + ${platform.length} Social Cat + ${dm.length} DM)</h1>
<p class="warn">Source of truth for outbound replies, generated ${new Date().toISOString()}. Voice rules: sounds like Aaron, no dashes, no dollar amounts unless the brand offered one first (only ${'NV-REPLY-0016'} and ${'NV-REPLY-0017'} contain numbers). Type these verbatim. DRAFT ONLY, never send.</p>
<h2>A. Gmail replies (create in-thread drafts)</h2>${email.map(block).join('')}
<h2>B. Social Cat platform replies (paste in Social Cat, not email)</h2>${platform.map(block).join('')}
<h2>C. Instagram DMs (paste in ManyChat, manual)</h2>${dm.map(block).join('')}
</body></html>`;

writeFileSync(join(root, 'reply-pack.html'), html);
console.log(`reply-pack.html: ${email.length} gmail + ${platform.length} social cat + ${dm.length} dm`);
