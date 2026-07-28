#!/usr/bin/env node
/**
 * sync-gmail-2026-07-28.mjs — one-off sync of deal statuses from the Jul 27-28
 * Gmail sent-mail sweep (standardized five-slots partnership pitch + custom
 * negotiations) into data/source/ui-export.csv, plus a paste-ready
 * data/source/sheet-update.csv for the audit Google Sheet.
 * Run once: node scripts/sync-gmail-2026-07-28.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => join(root, 'data', 'source', f);

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
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
const q = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';

const PITCH = 'standardized five-slots pitch sent ($10K/mo slot, 3-mo min, category exclusivity, ads from our Meta account w/ proof of spend, $2,500 one-off floor, noevarner.com/partners)';

// deal_id suffix -> { status, note, contact, last, email? }
const U = {
  '0001': { s: 'Pitched - Awaiting Reply', c: 'Jennifer', l: '2026-07-27', n: `Jul 21 custom reply; Jul 22 brand wants creator quote first; Jul 27: ${PITCH}. Also pitched Kimi via FynmeMedia (partnership@fynmemedia.com).` },
  '0002': { s: 'Pitched - Awaiting Reply', c: 'Eva', l: '2026-07-27', n: `Jul 22 brand spec: 1 short-form video 30-60s, channel-only usage, asked our quote; Jul 27: ${PITCH}.` },
  '0003': { s: 'Pitched - Awaiting Reply', c: 'Sunny', l: '2026-07-27', n: 'Jul 21 custom counter (base fee vs affiliate-only); Jul 27: standardized five-slots pitch sent to both KOL Connect Hub addresses (vip@ + elite@).' },
  '0004': { s: 'Pitched - Awaiting Reply', c: 'Amy / Max / Serena / Tiffany', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent to 4 Buzzy-linked contacts (amy@buzzy.now, max@buzzy.now, serena@buzzy.now Creati x Buzzy, tiffany@kolectcreator.com).' },
  '0005': { s: 'Pitched - Awaiting Reply', c: 'Lily', l: '2026-07-27', n: 'Jul 21 re-open sent; Jul 27: standardized five-slots pitch sent.' },
  '0006': { s: 'Pitched - Awaiting Reply', c: 'Kico', l: '2026-07-27', n: 'Jul 21 re-open sent; Jul 27: standardized five-slots pitch sent.' },
  '0007': { s: 'Pitched - Awaiting Reply', c: 'Eric', l: '2026-07-27', n: 'Jul 21 re-open sent; Jul 27: standardized five-slots pitch sent.' },
  '0008': { s: 'Pitched - Awaiting Reply', c: 'Theo', l: '2026-07-27', n: 'Jul 21 Theo replied interested same day; Jul 27: standardized five-slots pitch sent.' },
  '0009': { s: 'Pitched - Awaiting Reply', c: 'Sam', l: '2026-07-27', n: 'Jul 21 re-open sent; Jul 27: standardized five-slots pitch sent.' },
  '0010': { s: 'Negotiating', c: 'Cheryl', l: '2026-07-27', n: 'Jul 22 Cheryl: budget FLEXIBLE, wants 1 reel + link-in-bio 48h + 1-week exclusivity; Jul 27: standardized five-slots pitch sent.' },
  '0011': { s: 'Replied - Declined', c: 'Wendell', l: '2026-07-27', n: 'Jul 21 declined (off-niche); Jul 27 sweep sent standardized pitch anyway - disregard.' },
  '0012': { s: 'Pitched - Awaiting Reply', c: 'Sid', l: '2026-07-27', n: 'Jul 21 re-open (event passed); Jul 27: standardized five-slots pitch sent.' },
  '0013': { s: 'Pitched - Awaiting Reply', c: 'Robert', l: '2026-07-27', n: 'Jul 21 budget ask; Jul 27: standardized five-slots pitch sent.' },
  '0014': { s: 'Pitched - Awaiting Reply', c: 'Ana', l: '2026-07-27', n: 'Jul 21 custom reply; Jul 27: standardized five-slots pitch sent to both Faved addresses (faved.co.uk + favedsponsorships.com).' },
  '0015': { s: 'Negotiating', c: 'Olga', l: '2026-07-28', n: 'Jul 21 Olga asked for media kit; Jul 27 standardized pitch; Jul 28 Olga: max budget is BELOW our rate - counter with trimmed scope or pass.' },
  '0016': { s: 'Negotiating', c: 'Suri', l: '2026-07-27', n: 'Jul 21 bespoke counter ($250 vs 365-day global usage mismatch); Jul 21 Suri defended offer; Jul 27 standardized pitch sent. Likely dead unless usage trimmed.' },
  '0017': { s: 'Pitched - Awaiting Reply', c: 'Ira', l: '2026-07-27', n: 'Jul 21 counter: $400/2 videos well under rate, asked their ceiling; Jul 27: standardized five-slots pitch sent.' },
  '0018': { s: 'Pitched - Awaiting Reply', c: 'Kelsi', l: '2026-07-27', n: 'Jul 21 re-open; Jul 27: standardized five-slots pitch sent.' },
  '0019': { s: 'Pitched - Awaiting Reply', c: 'Felipe', l: '2026-07-27', n: 'Jul 21 custom reply (call locked earlier); Jul 27: standardized five-slots pitch sent.' },
  '0020': { s: 'Pitched - Awaiting Reply', c: 'Callie', l: '2026-07-27', n: 'Jul 21 custom "top tier fit" reply; Jul 27: standardized five-slots pitch sent.' },
  '0021': { s: 'Replied - Declined', c: 'Sandra', l: '2026-07-27', n: 'Jul 21 declined (off-niche); Jul 22 Sandra countered with S3 Pro chair; Jul 27 sweep sent standardized pitch.' },
  '0022': { s: 'Replied - Interested', c: 'Miriam', l: '2026-07-27', n: 'Jul 22 Miriam: GeeLark wants long-term mutually beneficial partnership; Jul 27: standardized five-slots pitch sent - awaiting terms.' },
  '0023': { s: 'Negotiating', c: 'Peter', l: '2026-07-27', n: 'Jul 21 Peter: 1 IG Reel package, flight Jul 21-Aug 21, 60-day IG Partnership Ad Codes; Jul 27 pitch sent; Jul 27 Peter: rate noted, holding to 1-reel package.' },
  '0024': { s: 'Pitch Bounced', c: 'Social Cat relay', l: '2026-07-27', n: 'Jul 27 standardized pitch BOUNCED - partnerships2.thesocialcat.com relay invalid; must reply inside Social Cat platform.' },
  '0025': { s: 'Pitched - Awaiting Reply', c: 'Annie', l: '2026-07-27', n: 'Jul 21 positive custom reply (50% advance + 12-mo affiliate acknowledged); Jul 27: standardized five-slots pitch sent.' },
  '0026': { s: 'Replied - Declined', c: 'Block Blast team', l: '2026-07-21', n: 'Jul 21 decline sent (off-niche); bounced - media.hungrystudio.com domain invalid.' },
  '0027': { s: 'Pitched - Awaiting Reply', c: 'Nancy', l: '2026-07-27', n: 'Jul 21 full rate structure sent; Jul 27: standardized five-slots pitch sent.' },
  '0028': { s: 'Pitched - Awaiting Reply', c: 'Keke', l: '2026-07-27', n: 'Jul 21 custom quote sent; Jul 27: standardized five-slots pitch sent.' },
  '0029': { s: 'Pitched - Awaiting Reply', c: 'Olivia / Tori', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent to Olivia (EezyCollab) and Tori (NoxInfluencer/talentcollaboration).' },
  '0030': { s: 'Pitch Bounced', c: 'Social Cat relay', l: '2026-07-27', n: 'Jul 27 standardized pitch BOUNCED - Social Cat relay invalid; reply in-platform.' },
  '0031': { s: 'Pitch Bounced', c: 'Claudio (Social Cat)', l: '2026-07-27', n: 'Jul 27 standardized pitch BOUNCED - Social Cat relay invalid; reply in-platform.' },
  '0032': { s: 'Negotiating', c: 'Influnex rep', l: '2026-07-27', n: 'Jul 22 confirmed authorized rep; has live Emergent AI campaign; Jul 27: standardized five-slots pitch sent.' },
  '0033': { s: 'Pitched - Awaiting Reply', c: 'TopYappers team', l: '2026-07-27', n: 'Jul 21 custom reply; Jul 27: standardized five-slots pitch sent.' },
  '0034': { s: 'Pitch Bounced', c: 'Wasir', l: '2026-07-27', n: 'Jul 27 standardized pitch BOUNCED - wasir@burakima.tech address not found.' },
  '0035': { s: 'Negotiating', c: 'Vinod / Aman', l: '2026-07-27', n: 'Jul 21 custom rates reply; Jul 27 standardized pitch; Jul 27 Vinod added Aman (aman@magicstudio.com) to take ahead - Aaron acked, awaiting their proposal.' },
  '0036': { s: 'Negotiating', c: 'Clara', l: '2026-07-27', n: 'Jul 21 quoted $2,500/reel + 30-day ad code pricing; Jul 27 Clara: campaigns are project-based only, not long-term slots - decide one-off vs pass.' },
  '0037': { s: 'Pitched - Awaiting Reply', c: 'Rixin', l: '2026-07-27', n: 'Jul 21 re-engage; Jul 27: standardized five-slots pitch sent.' },
  '0038': { s: 'Pitched - Awaiting Reply', c: 'Maggie', l: '2026-07-27', n: 'Jul 21 re-engage; Jul 27: standardized five-slots pitch sent.' },
  '0039': { s: 'Pitched - Awaiting Reply', c: 'FalcoCut team', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent (record was Archive).' },
  '0040': { s: 'Pitched - Awaiting Reply', c: 'Jordan', l: '2026-07-27', n: 'Jul 21 re-engage; Jul 27: standardized five-slots pitch sent.' },
  '0041': { s: 'Replied - Declined', c: 'Maryam', l: '2026-07-27', n: 'Jul 22 Maryam: Voiskey paused all IG campaigns - not now; Jul 27 sweep sent standardized pitch anyway.' },
  '0042': { s: 'Pitched - Awaiting Reply', c: 'Dora', l: '2026-07-27', n: 'Jul 21 custom reply; Jul 27: standardized five-slots pitch sent.' },
  '0043': { s: 'Pitched - Awaiting Reply', c: 'Vicky', l: '2026-07-27', n: 'Jul 21 custom reply; Jul 27: standardized five-slots pitch sent.' },
  '0044': { s: 'Pitched - Awaiting Reply', c: 'Amy', l: '2026-07-27', n: 'Jul 21 custom reply; Jul 27: standardized five-slots pitch sent.' },
  '0045': { s: 'Pitched - Awaiting Reply', c: 'Yvonne / Hannah', l: '2026-07-27', n: 'Jul 21 custom reply (SSG); Jul 27: standardized five-slots pitch sent to SSG (yvonne@ssgmcn.com) and BlueFocus affiliate contact (hannah@affiliate.bluefocus.com).' },
  '0046': { s: 'Pitched - Awaiting Reply', c: 'Bella / Julie', l: '2026-07-27', n: 'Jul 21 custom reply; Jul 27: standardized five-slots pitch sent to GlobeInflu (bella@) and SSG (julie@ssgmcn.com).' },
  '0047': { s: 'Pitched - Awaiting Reply', c: 'Kavy', l: '2026-07-27', n: 'Jul 21 custom reply (knows Higgsfield well); Jul 27: standardized five-slots pitch sent. See also NV-DEAL-0077 (Jeevmedia) - Heek thread left unanswered.' },
  '0048': { s: 'Pitched - Awaiting Reply', c: 'Andika', l: '2026-07-27', n: 'Jul 21 custom reply; Jul 27: standardized five-slots pitch sent.' },
  '0049': { c: 'Aidan', l: '2026-07-27', n: 'Jul 27 sweep sent standardized pitch despite scam flag - do NOT pursue without verifying the agency.' },
  '0050': { s: 'Negotiating', c: 'Iris', l: '2026-07-27', n: 'Jul 22 AhaCreator asked for deliverables/timeline to build proposal; Jul 24 reminder from them; Jul 27: standardized five-slots pitch sent.' },
  '0051': { s: 'Pitched - Awaiting Reply', c: 'Claire', l: '2026-07-27', n: 'Jul 21 budget-verification ask; Jul 27: standardized five-slots pitch sent.' },
  '0052': { s: 'Replied - Interested', c: 'Ariel', l: '2026-07-27', n: 'Jul 23 Ariel: appreciates detailed proposal + content strategy for G2 glasses; Jul 27: standardized five-slots pitch sent.' },
  '0053': { s: 'Pitched - Awaiting Reply', c: 'Sophie', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent.' },
  '0054': { s: 'Replied - Interested', c: 'Luna / Jane / Soren / Keyshe', l: '2026-07-28', n: 'Jul 28 GrowMax: profile recommended to client, discussing details. Pitched via 3 agencies: GrowMax, Superlinear (Jane + Soren - Soren replied Jul 28, first-time-buyer caution), Fancy Media (Keyshe).' },
  '0055': { s: 'Pitched - Awaiting Reply', c: 'Chris', l: '2026-07-27', n: 'Jul 21 custom angle pitch; Jul 27: standardized five-slots pitch sent.' },
  '0056': { s: 'Pitched - Awaiting Reply', c: 'Siyo', l: '2026-07-27', n: 'Jul 21 custom reply; Jul 27: standardized five-slots pitch sent.' },
  '0057': { s: 'Replied - Interested', c: 'Angelina', l: '2026-07-27', n: 'Jul 21 detailed pricing + 3-variant unlisted/Google-Ads structure sent; Jul 22 Angelina forwarded internally, positive; Jul 27: standardized five-slots pitch sent.' },
  '0058': { s: 'Pitched - Awaiting Reply', c: 'Carey', l: '2026-07-27', n: 'Jul 21 custom reply; Jul 27: standardized five-slots pitch sent.' },
  '0059': { s: 'Pitched - Awaiting Reply', c: 'Emily / Thea', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent to emily@sparkols (AiPPT) and thea@sparkols (unnamed AI creative tools campaign).' },
  '0060': { s: 'Pitched - Awaiting Reply', c: 'Himanshu', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent.' },
  '0061': { s: 'Pitched - Awaiting Reply', c: 'Philip / Alan / Abby', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent to 3 Meet August intermediaries (sustainconvert, expanessentialfi, goprospectloop).' },
  '0062': { s: 'Replied - Declined', c: 'Jon', l: '2026-07-28', n: 'Jul 27 standardized pitch; Jul 28 Jon: Happy Oyster adjusting promo plans, future collab depends on prior campaign results; Aaron sent friendly close-out Jul 28. Nurture later.' },
  '0063': { s: 'Pitched - Awaiting Reply', c: 'Emily / Sandy', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent to GrowMaxValue (emily.cole@) and Deeplink (sandy@business.lessie.top, Seedance 2.5 angle).' },
  '0064': { s: 'Pitched - Awaiting Reply', c: 'Tina', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent.' },
  '0065': { s: 'Pitched - Awaiting Reply', c: 'Sylvia', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent.' },
  '0069': { s: 'Pitched - Awaiting Reply', c: 'Philip Wolf', l: '2026-07-27', e: 'philip@mightyjoy.com', n: 'Jul 27: standardized five-slots pitch sent (roster/agency - slot model likely poor fit for them).' },
  '0074': { s: 'Pitched - Awaiting Reply', c: 'Yvonne', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent.' },
  '0075': { s: 'Pitched - Awaiting Reply', c: 'Evelyn', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent (they had chased 4x for rates).' },
  '0076': { s: 'Pitched - Awaiting Reply', c: 'Rachel', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent. CAUTION: Similarweb is also a LIVE Airtable deal via Mo - align before renegotiating terms.' },
  '0077': { s: 'Negotiating', c: 'Palak', l: '2026-07-28', n: 'Jul 27 standardized pitch; Jul 28 Palak: slot model "quite different", they want one-off IG rates - quote one-off ($2,500 floor).' },
  '0078': { s: 'Pitch Bounced', c: 'Social Cat relay', l: '2026-07-27', n: 'Jul 27 standardized pitch BOUNCED - Social Cat relay invalid; reply in-platform.' },
  '0079': { s: 'Replied - Interested', c: 'Viral Mind team', l: '2026-07-28', n: 'Jul 27 standardized pitch; Jul 28 long positive reply, wants to proceed (greeting "Hi Haitham" = template slip on their side).' },
  '0080': { s: 'Pitched - Awaiting Reply', c: 'Iris', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent to AhaCreator (covers remio / Teamily / broker brands).' },
  '0081': { s: 'Pitched - Awaiting Reply', c: 'Brooke', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent.' },
  '0082': { s: 'Pitch Bounced', c: 'Social Cat relay', l: '2026-07-27', n: 'Jul 27 standardized pitch BOUNCED - Social Cat relay invalid; reply in-platform.' },
  '0083': { s: 'Pitched - Awaiting Reply', c: 'Jackson', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent.' },
  '0084': { s: 'Negotiating', c: 'Bilal', l: '2026-07-27', n: 'Jul 27 pitch -> Bilal clarified agency-page usage + 2 alt campaigns; Aaron countered $2,500 + $500/extra platform, 50% deposit; Bilal: no upfront payment per company policy. Stalemate on payment terms.' },
  '0085': { s: 'Pitched - Awaiting Reply', c: 'Iris', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent via the AhaCreator reply (agency broker).' },
  '0086': { s: 'Pitch Bounced', c: 'Social Cat relay', l: '2026-07-27', n: 'Jul 27 standardized pitch BOUNCED - Social Cat relay invalid; reply in-platform.' },
  '0087': { s: 'Pitched - Awaiting Reply', c: 'Sansa', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent.' },
  '0088': { s: 'Pitched - Awaiting Reply', c: 'Selina', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent.' },
  '0089': { s: 'Pitched - Awaiting Reply', c: 'Jay', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent.' },
  '0090': { s: 'Pitched - Awaiting Reply', c: 'Alex / Lucy', l: '2026-07-27', n: 'Jul 27: standardized five-slots pitch sent to Nemo Global (Alex7@collab.creafluentor.com) and Tec-Do (lucy.peng@tec-do.com).' },
  '0091': { s: 'Negotiating', c: 'Joyce / Mini', l: '2026-07-28', n: 'Jul 27 pitch to Katlas (Joyce) + AheadFour (Mini); Jul 28 Mini: wants ONE-OFF sponsored video, asked for rates + details - quote $2,500+.' },
  '0092': { s: 'Replied - Interested', c: 'Villela', l: '2026-07-28', n: 'Jul 27 standardized pitch; Jul 28 Villela: TYPELESS wants to MOVE FORWARD with a single sponsored video - quote one-off ($2,500 floor) and close.' }
};

const gurl = (t) => `https://mail.google.com/mail/u/0/#all/${t}`;
// New deals from the sent-mail sweep (no existing record)
const NEW = [
  ['Radiate Studio', 'AI video platform (Seedance et al, cost-cutting)', 'AI Video', 'Infmar', 'Zack@infmar.com', 'Sponsored Video', 'Zack', '19f849bf7d3d16b4', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent.'],
  ['ScoutNow (creator club)', 'Creator club brokering VC-backed startup content deals', 'Creator Economy', 'ScoutNow', 'contact@outreach.scoutnow.me', 'Content Deal Broker', 'Arthur', '19fa609494110155', 'Negotiating', '2026-07-28', 'Jul 28: custom reply - quoted $2,500/post floor, contract/long-term only, asked what they need.'],
  ['AMZUPSCALE', 'Amazon store build-out service', 'Non-AI Business', '', 'amazonops338@gmail.com', 'Sponsored Post', 'AMZUPSCALE team', '19f605c6d6146d84', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent. Generic gmail contact - verify before any deal.'],
  ['Internet People (UGC agency)', 'Tech UGC agency creator program', 'Creator Economy', 'Internet People', 'alan@mantrabyte.org', 'UGC Retainer', 'Louis / Alan', '19f850a3eca7031a', 'Replied - Declined', '2026-07-27', 'Jul 27 pitch -> their program is $700/mo retainers, under the $2,500 floor; Aaron passed same day.'],
  ['Impact Driven AI', 'Brittany Long AI marketing program', 'AI Marketing', '', 'kloie@impactdrivenai.com', 'Creator Partnership', 'Kloie', '19f82ecfb085f362', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent.'],
  ['NoMeet', 'AI note-taking app (GPT-5): audio to summaries/mind maps', 'AI Productivity', '', 'bd-nikki@nomeetapp.com', 'Paid Cooperation', 'Nikki', '19f841164ec16979', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent.'],
  ['Fetra AI', 'AI growth platform for SMBs (social, SEO, paid ads)', 'AI Marketing', '', 'yvaine@fetra.ai', 'Sponsored Content', 'Yvaine', '19f8458d7e562d4e', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent.'],
  ['RayNeo (via SSG)', 'AR glasses launch campaign', 'Non-AI Technology', 'SSG', 'james@ssgmcn.com', 'Product Launch', 'James', '19f8458d8bcbe569', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent. Off-niche hardware - low priority.'],
  ['SSG agency roster', 'AI tool reviews for SSG clients (Midea/TikTok/Lovart)', 'Agency Roster', 'SSG / Star Speedy Growth', 'kevin@ssg.work', 'Agency Roster', 'Kevin Chen', '19f6575945a4cd64', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent.'],
  ['Hollyland LARK A1 (via MakeWonder)', 'LARK A1 wireless microphone video', 'Non-AI Technology', 'MakeWonder', 'yolanda@makewondermcn.com', 'Sponsored Video', 'Yolanda', '19f93cc734b1c474', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent.'],
  ['Manus AI (via GrowMax)', 'IG Reel + link-in-bio, 1wk exclusivity vs Genspark', 'AI Productivity', 'GrowMax', 'tella@grow-max.com', 'Sponsored Instagram Reel', 'Tella Tu', '19f93cc95d5dbf1e', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent.'],
  ['Lessie AI', 'AI people-search / prospecting tool', 'AI Sales', '', 'jaelyn.work@business.lessie.email', 'Sponsored Instagram Reel', 'Jaelyn', '19f93cc9b4cbeb01', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent.'],
  ['Pollo AI (via SSG)', 'Q3 2026 product launch video', 'AI Video', 'SSG', 'reann@ssgmcn.com', 'Sponsored Video', 'Reann Chen', '19f93cca0b49fed6', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent.'],
  ['Ribbi AI (via Tec-Do)', 'Autonomous AI creative agent (Somasole Inc)', 'AI Marketing', 'Tec-Do', 'maria.tang@offer.tec-do.com', 'Sponsored Video', 'Maria Tang', '19f9e1975071584b', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent.'],
  ['TeemDrop', 'AI dropshipping fulfillment platform', 'AI E-commerce', 'NoxInfluencer / Creafluentor', 'naia@creator.noxinfluencer.com', 'Paid Campaign', 'Naia / Ryan', '19fa33feb89bd503', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent to both intermediaries (naia@creator.noxinfluencer.com, ryan@mcn.creafluentor.com).'],
  ['Ruune (via Social Cat)', 'MagSafe AI voice recorder', 'AI Hardware', 'Social Cat', 'info@partnerships3.thesocialcat.com', 'Sponsored Content', 'Kristen', '19f8ea650bd2811f', 'Pitch Bounced', '2026-07-27', 'Jul 27 standardized pitch BOUNCED - Social Cat relay invalid; reply in-platform.'],
  ['Orrenwood (via Social Cat)', 'Air V1 sleep-cooling device, commission-only', 'Non-AI Consumer', 'Social Cat', 'info@partnerships3.thesocialcat.com', 'Affiliate', 'Abraham Landez', '19f93ccab2ce2880', 'Pitch Bounced', '2026-07-27', 'Jul 27 standardized pitch BOUNCED - Social Cat relay invalid; commission-only + off-niche, low priority.'],
  ['Expertise AI', 'IG creator partnership', 'AI Business', '', 'bee.sayabo@expertise.ai', 'Creator Partnership', 'Bee Sayabo', '19f897efe6a4e9b0', 'Pitched - Awaiting Reply', '2026-07-27', 'Jul 27: standardized five-slots pitch sent.'],
  ['Betatron', 'Autonomous Google Ads AI agent', 'AI Marketing', '', 'david.james@betatron.ai', 'Paid Promo', 'David James', '19f897f0718d12a2', 'Call Booked', '2026-07-27', 'Jul 27 pitch -> David wants a call to explore slot vs one-off; cal.com/noe-varner/partnership-call link sent. HOT - prep for call.'],
  ['HockeyStick / Happy Horse', 'Tutorial video for HappyHorse', 'AI Tools', 'HockeyStick', 'mariel.manoos@hockeystick.io', 'Tutorial Video', 'Mariel Manoos', '19fa368d823b0f25', 'Replied - Interested', '2026-07-28', 'Jul 27 pitch; Jul 28 Mariel: rate shared with team for review, will follow up.']
];

// ---------- apply to ui-export.csv ----------
const text = readFileSync(src('ui-export.csv'), 'utf8');
const rows = parseCSV(text);
const header = rows[0];
const gi = (n) => header.indexOf(n);
if (gi('sync_notes') === -1) header.push('sync_notes');
const SN = gi('sync_notes');

let updated = 0;
for (const r of rows.slice(1)) {
  while (r.length < header.length) r.push('');
  const suffix = r[gi('deal_id')].slice(-4);
  const u = U[suffix];
  if (!u) continue;
  if (u.s) r[gi('status')] = u.s;
  if (u.e) r[gi('contact_email')] = u.e;
  r[gi('days_since_contact')] = u.l === '2026-07-28' ? '0' : '1';
  r[gi('data_last_updated')] = '2026-07-28 12:00 GMT';
  r[SN] = u.n;
  updated++;
}

let nextId = 93;
for (const [brand, product, cat, agency, email, dealType, contact, tid, status, last, note] of NEW) {
  const r = header.map(() => '');
  const set = (k, v) => { r[gi(k)] = v; };
  set('deal_id', `NV-DEAL-${String(nextId).padStart(4, '0')}`);
  set('brand', brand); set('product', product); set('ai_category', cat); set('agency', agency);
  set('contact_email', email); set('deal_type', dealType);
  set('grade', 'C'); set('priority', 'Medium');
  set('scam_risk', 'None Observed'); set('legal_review', 'No');
  set('recommended_action', status === 'Pitch Bounced' ? 'Re-send inside Social Cat platform' : 'Await reply to five-slots pitch; follow up in 5 days');
  set('status', status);
  set('days_since_contact', last === '2026-07-28' ? '0' : '1');
  set('gmail_thread_url', gurl(tid));
  set('rights_flags', 'None detected');
  set('data_last_updated', '2026-07-28 12:00 GMT');
  set('record_version', 'v3.1-GMAIL-SYNC');
  set('commercial_structure', 'Posted sponsorship');
  set('minimum_package_applies', 'No'); set('strategic_exception_required', 'No');
  set('sync_notes', note);
  rows.push(r);
  nextId++;
}

writeFileSync(src('ui-export.csv'), rows.map((r) => r.map(q).join(',')).join('\n') + '\n');
console.log(`ui-export.csv: ${updated} deals updated, ${NEW.length} added, total ${rows.length - 1}`);

// ---------- sheet-update.csv (paste-ready for the audit Google Sheet) ----------
const out = [['brand', 'contact', 'email', 'stage', 'last_action_date', 'notes'].map(q).join(',')];
const byId = {};
for (const r of rows.slice(1)) byId[r[gi('deal_id')].slice(-4)] = r;
for (const [suffix, u] of Object.entries(U)) {
  const r = byId[suffix];
  out.push([r[gi('brand')], u.c, r[gi('contact_email')], u.s || r[gi('status')], u.l, u.n].map(q).join(','));
}
for (const [brand, , , , email, , contact, , status, last, note] of NEW) {
  out.push([brand, contact, email, status, last, note].map(q).join(','));
}
writeFileSync(src('sheet-update.csv'), out.join('\n') + '\n');
console.log(`sheet-update.csv: ${out.length - 1} rows`);
