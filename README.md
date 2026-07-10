# Noe Varner — Partnerships OS

Private, Apple-style CRM and negotiation command center for Noe Varner's brand partnerships. Built for Aaron. Static app — no build step, no framework, no server.

## Deploy to Cloudflare Pages

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect this repo.
2. Build command: *(none)* · Build output directory: `/`
3. Deploy. Every push to `main` redeploys.

**Keep it private:** this app contains real deal data. In Cloudflare, enable **Zero Trust → Access** on the Pages domain (one policy: allow only your email) so nothing is public. `_headers` already blocks search indexing.

## What's inside

| Area | What it does |
|---|---|
| Home | Today's actions, money on the table (confidence-separated), top negotiations, risks, Claude's read |
| Deals / Pipeline | All 65 audited deals, filters, kanban stages |
| Negotiations | Per-deal workspace: position, recommendation, approval-gated draft in Aaron's voice |
| Follow-Ups | 57-row queue grouped by urgency |
| Responses | All 62 prepared drafts (HOLD by default; no send button anywhere, by design) |
| Brands / Contacts | Deep research on 18 priority brands; all counterparties |
| Contracts & Files | Drive-file references + extracted contract terms (fills as documents arrive) |
| Rate Card | v3.0 pricing: $1,000/post · 3-post min · $3,000 floor; rights always separate |
| Data Health | Source sync status, validation, layer separation |
| Settings | Aaron Voice Profile, Voice Library, operational data export/import |

## Data model — two layers, never mixed

- **Source (read-only):** the audited Google Sheet → `data/source/` → compiled to `data/nv-data.js` by `scripts/build-data.mjs` (validates 65 unique IDs, probability math, draft counts; fails loudly).
- **Operational (Aaron's):** stages, notes, approvals, brand replies, voice feedback → browser localStorage with full before/after activity history. Export/import from Settings. Original audit facts are never overwritten.

## Syncing new data from the sheet

```bash
node scripts/sync.mjs        # re-pull UI Export from the Google Sheet
node scripts/build-data.mjs  # validate + rebuild data/nv-data.js
git commit -am "sync" && git push
```

Or just tell Claude in Cowork to "sync the deal sheet" — it reads every tab and pushes.

## Negotiating with Claude

There's no API key in this app on purpose. Claude (in Cowork) is the copilot: it has this repo, the sheet, and the voice profile. Paste a brand's reply into the deal's Messages tab to log it, then ask Claude for the counter — it drafts in Aaron's voice, you approve, you send from Gmail.

Guardrails that hold everywhere: no autonomous sending, no accepting offers, no perpetual usage, no AI-likeness/voice/training rights bundled into fees, no going below the $3,000 organic floor without an explicit `EXCEPTION REQUIRES AARON APPROVAL`.
