/* views.js — all screen renderers. Reads window.NV_DATA (immutable audit) + NVStore (operational). */

const NV = window.NV_DATA;

/* ---------------- helpers ---------------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt$ = (n) => n == null || n === '' ? '—' : '$' + Number(n).toLocaleString('en-US');
const pct = (p) => p == null || p === '' ? '—' : Math.round(p * 100) + '%';
const num = (n) => n == null || n === '' ? 0 : Number(n);
const dealById = (id) => NV.deals.find((d) => d.deal_id === id);
const draftByDeal = (id) => NV.drafts.find((x) => x.dealId === id);
const draftsByDeal = (id) => NV.drafts.filter((x) => x.dealId === id);
const draftById = (id) => NV.drafts.find((x) => x.id === id);
const researchByDeal = (id) => NV.research.find((r) => r.dealId === id);
const mcById = (id) => NV.manychat.records.find((m) => m.id === id);
const mcForDeal = (dealId) => NV.manychat.records.filter((m) => m.linkedDealId === dealId || m.relatedDealId === dealId);

/* Source-channel badges: email / Instagram DM via ManyChat / both */
const CH_LABEL = { email: '✉ Email', manychat: '◇ DM', both: '✉+◇ Email + DM', unknown: '?' };
const CH_TITLE = { email: 'Email', manychat: 'Instagram DM via ManyChat', both: 'Email + Instagram DM via ManyChat', unknown: 'Source unknown' };
const chBadge = (ch) => `<span class="chip ${ch === 'both' ? 'purple' : ch === 'manychat' ? 'blue' : ''}" title="${CH_TITLE[ch] || ''}">${CH_LABEL[ch] || ''}</span>`;
const chBadgeDraft = (ch) => ch === 'dm' ? '<span class="chip blue" title="Instagram DM via ManyChat">◇ DM</span>' : '<span class="chip" title="Email">✉ Email</span>';

const GRADE_COLOR = { 'B': 'green', 'C': 'blue', 'D': 'amber', 'Reject/Archive': 'red' };
const gradeChip = (g) => `<span class="chip ${GRADE_COLOR[g] || ''}">Grade ${esc(g)}</span>`;
const scamChip = (s) => {
  if (s === 'High') return '<span class="chip red">⚠︎ Scam risk: High</span>';
  if (s === 'Medium') return '<span class="chip red">Scam risk: Medium</span>';
  if (s === 'Low') return '<span class="chip amber">Scam risk: Low</span>';
  return '';
};
const structChip = (s) => {
  const map = { 'Do-not-engage': 'red', 'Decline/Archive': '', 'Strategic exception': 'purple', 'Retainer/Ambassador': 'blue', 'Paid-ad/Licensing': 'blue' };
  return `<span class="chip ${map[s] ?? ''}">${esc(s)}</span>`;
};
const estChip = () => '<span class="chip purple" title="Calculated during the audit — estimated, not confirmed by the brand">est</span>';

const STAGES = ['New', 'Response Drafted', 'In Negotiation', 'Verbal Agreement', 'Contract Review', 'Won', 'Paid', 'Declined', 'Do Not Engage'];
function dealStage(d) {
  const ops = NVStore.getStage(d.deal_id);
  if (ops) return ops;
  if (d.commercial_structure === 'Do-not-engage') return 'Do Not Engage';
  if (d.commercial_structure === 'Decline/Archive') return 'Declined';
  if (d.status === 'Archive') return 'Declined';
  if (draftByDeal(d.deal_id)) return 'Response Drafted';
  return 'New';
}
const isViable = (d) => !['Do-not-engage', 'Decline/Archive'].includes(d.commercial_structure);
const isActionable = (d) => isViable(d) && !['Won', 'Paid', 'Declined', 'Do Not Engage'].includes(dealStage(d));

function copyText(text, msg) {
  navigator.clipboard?.writeText(text).then(() => toast(msg || 'Copied'), () => toast('Copy failed'));
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2200);
}
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
const barRow = (label, val, max, fmt) => `
  <div class="bar-row">
    <div class="bar-label" title="${esc(label)}">${esc(label)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${max ? Math.max(2, (val / max) * 100) : 0}%"></div></div>
    <div class="bar-val">${fmt ? fmt(val) : val}</div>
  </div>`;

const dealLink = (id) => `#/deal/${id}`;
const rowClick = `onclick="location.hash=this.dataset.href"`;

/* ---------------- HOME ---------------- */
function viewHome() {
  const viable = NV.deals.filter(isViable);
  const money = NV.dashboard.money;
  const m = Object.fromEntries(money.map((x) => [x.key, x]));

  const topNegotiations = [...viable].filter(isActionable).sort((a, b) => num(b.prob_weighted_usd) - num(a.prob_weighted_usd)).slice(0, 6);
  const dueNow = NV.followups.filter((f) => /24-48|48h/.test(f.timing)).length;
  const mc = NV.manychat.records;
  const chn = NV.meta.channels;
  const dmDraftsPending = NV.drafts.filter((x) => x.channel === 'dm' && !NVStore.getDraftStatus(x.dealId)).length;
  const highPriority = NV.followups.filter((f) => f.timing.includes('high priority'));
  const legal = NV.deals.filter((d) => d.legal_review === 'YES');
  const scams = NV.deals.filter((d) => ['High', 'Medium'].includes(d.scam_risk));
  const explicit = NV.deals.filter((d) => d.explicit_cash_usd > 0);
  const stale = viable.filter((d) => d.days_since_contact > 20 && isActionable(d));
  const exceptions = NV.deals.filter((d) => d.strategic_exception_required === 'Yes');
  const approvals = NV.drafts.filter((x) => !NVStore.getDraftStatus(x.dealId));

  const respondFirst = [...viable].filter(isActionable).sort((a, b) => num(b.prob_weighted_usd) - num(a.prob_weighted_usd)).slice(0, 5);

  const moneyCard = (x, cls) => `
    <div class="card kpi">
      <div class="kpi-label">${esc(x.label)} <span class="chip ${cls}">${esc(x.type)}</span></div>
      <div class="kpi-value">${fmt$(x.amount)}${x.key === 'monthly_recurring' ? '<span style="font-size:14px;color:var(--text-2)">/mo</span>' : ''}</div>
      <div class="kpi-note">${esc(x.notes)}</div>
    </div>`;

  return {
    title: 'Home',
    html: `
    <h1 class="page-title">Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, Aaron</h1>
    <div class="page-sub">${NV.deals.length} deals (${chn.email} email · ${chn.manychat} DM · ${chn.both} both) · ${viable.length} viable · ${NV.drafts.length} drafts prepared · ${dueNow} follow-ups due within 48 hours</div>

    <div class="section-title">Today</div>
    <div class="grid cols-4">
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/responses'">
        <div class="kpi-label">Responses awaiting approval</div>
        <div class="kpi-value">${approvals.length}</div>
        <div class="kpi-note">Every draft is approval-gated. Nothing sends itself.</div>
      </div>
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/followups'">
        <div class="kpi-label">Follow-ups due (48h)</div>
        <div class="kpi-value">${dueNow}</div>
        <div class="kpi-note">${highPriority.length} flagged high priority: ${highPriority.map((f) => esc(f.brand.split(' ')[0])).join(', ')}</div>
      </div>
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/deals?filter=legal'">
        <div class="kpi-label">Rights / legal review</div>
        <div class="kpi-value">${legal.length}</div>
        <div class="kpi-note">Incl. Dreamina — CRITICAL perpetual whitelisting request.</div>
      </div>
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/deals?filter=counter'">
        <div class="kpi-label">Deals needing a counter</div>
        <div class="kpi-value">${explicit.length}</div>
        <div class="kpi-note">${explicit.map((d) => `${esc(d.brand)} (${fmt$(d.explicit_cash_usd)} offered)`).join(' · ')}</div>
      </div>
    </div>

    <div class="section-title">ManyChat discovery <span class="hint">Instagram DM audit — ${esc(NV.manychat.syncedAt)}</span></div>
    <div class="grid cols-4">
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/manychat'">
        <div class="kpi-label">Commercial DM conversations</div>
        <div class="kpi-value">${mc.length}</div>
        <div class="kpi-note">${mc.filter((x) => x.classification === 'New Deal').length} new deals · ${mc.filter((x) => x.classification === 'Existing Deal Enriched').length} existing deals enriched.</div>
      </div>
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/responses'">
        <div class="kpi-label">DM drafts awaiting review</div>
        <div class="kpi-value">${dmDraftsPending}</div>
        <div class="kpi-note">All held: “HOLD — human review &amp; send manually.”</div>
      </div>
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/manychat?filter=Possible Duplicate'">
        <div class="kpi-label">Possible duplicates</div>
        <div class="kpi-value">${mc.filter((x) => x.classification === 'Possible Duplicate').length}</div>
        <div class="kpi-note">Dreamina intermediary approaches — no pipeline value until authorization is verified.</div>
      </div>
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/manychat?filter=Needs Manual Review'">
        <div class="kpi-label">Manual review / conflicts</div>
        <div class="kpi-value">${mc.filter((x) => x.classification === 'Needs Manual Review').length + mc.filter((x) => x.channelConflict).length}</div>
        <div class="kpi-note">Riya (undisclosed brand) · Higgsfield direct-brand vs agency route.</div>
      </div>
    </div>

    ${(() => {
      const A = NV.active?.deals || [];
      if (!A.length) return '';
      const live = A.filter((a) => a.stage !== 'DEAD');
      const collected = A.reduce((s, a) => s + (a.received || 0), 0);
      const outstanding = live.reduce((s, a) => s + Math.max(0, (a.amount || 0) - (a.received || 0)), 0);
      const approval = live.filter((a) => a.stage === 'Needs Approval');
      return `
    <div class="section-title">Live deals <span class="hint">from Airtable — real signed work, real cash</span></div>
    <div class="grid cols-4">
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/active'">
        <div class="kpi-label">Cash collected <span class="chip green">CONFIRMED</span></div>
        <div class="kpi-value">${fmt$(collected)}</div>
        <div class="kpi-note">Payments actually received.</div>
      </div>
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/active'">
        <div class="kpi-label">Outstanding <span class="chip green">CONFIRMED</span></div>
        <div class="kpi-value">${fmt$(outstanding)}</div>
        <div class="kpi-note">Contracted balance to collect on live deals.</div>
      </div>
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/active'">
        <div class="kpi-label">In production</div>
        <div class="kpi-value">${live.length}</div>
        <div class="kpi-note">${live.reduce((s, a) => s + (a.assets.totalRemaining || 0), 0)} assets still owed across live deals.</div>
      </div>
      <div class="card kpi" style="cursor:pointer" onclick="location.hash='#/active'">
        <div class="kpi-label">Awaiting approval</div>
        <div class="kpi-value">${approval.length}</div>
        <div class="kpi-note">${approval.map((a) => esc(a.brand)).join(' · ') || '—'}</div>
      </div>
    </div>`;
    })()}

    <div class="section-title">Money on the table <span class="hint">audited inbound offers — separated by confidence, never summed</span></div>
    <div class="grid cols-3">
      ${moneyCard(m.confirmed_one_time_cash, 'green')}
      ${moneyCard(m.monthly_recurring, 'green')}
      ${moneyCard(m.prob_weighted, 'blue')}
      ${moneyCard(m.base_market, 'purple')}
      ${moneyCard(m.likely_pipeline, 'purple')}
      ${moneyCard(m.hidden_rights, 'purple')}
    </div>
    <div class="banner purple" style="margin-top:14px"><span>◆</span><div><b>${fmt$(m.annualized_recurring.amount)} annualized recurring is speculative</b> — $2,000/mo × 12 only if Ssemble renews; duration is unconfirmed. Noncash value (${fmt$(m.noncash.amount)}) and affiliate upside are tracked separately and excluded from all cash totals.</div></div>

    <div class="section-title">Top negotiations <span class="hint">by probability-weighted value</span></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Deal</th><th>Structure</th><th class="money">Their offer</th><th class="money">Opening ask</th><th class="money">Floor</th><th class="money">Weighted</th><th>Close prob</th><th>Next action</th></tr></thead>
      <tbody>
      ${topNegotiations.map((d) => `
        <tr data-href="${dealLink(d.deal_id)}" ${rowClick}>
          <td><b>${esc(d.brand)}</b><br><span style="color:var(--text-3);font-size:11.5px">${esc(d.deal_id)}</span></td>
          <td>${structChip(d.commercial_structure)}</td>
          <td class="money">${d.explicit_cash_usd > 0 ? `<b>${fmt$(d.explicit_cash_usd)}</b>` : '<span style="color:var(--text-3)">None stated</span>'}</td>
          <td class="money">${fmt$(d.total_recommended_opening_ask)}</td>
          <td class="money">${fmt$(d.minimum_acceptable_close)}</td>
          <td class="money"><b>${fmt$(d.prob_weighted_usd)}</b> ${estChip()}</td>
          <td>${pct(d.close_probability)}<div class="prob-bar" style="width:64px"><div style="width:${d.close_probability * 100}%"></div></div></td>
          <td style="max-width:220px;font-size:12.5px;color:var(--text-2)">${esc(d.recommended_action)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>

    <div class="section-title">Risks</div>
    <div class="grid cols-2">
      <div class="card">
        <h3>Dangerous rights requests</h3>
        ${[['NV-DEAL-0028', 'Perpetual whitelisting + open-ended competitor-priority clause', 'red'],
           ['NV-DEAL-0016', '365-day global ad license offered at $250', 'amber'],
           ['NV-DEAL-0029', 'AI digital-human platform — confirm no likeness/voice use', 'amber'],
           ['NV-DEAL-0064', 'Interactive AI character model — confirm no synthetic likeness', 'amber'],
           ['NV-DEAL-0065', '180-day global usage + ad code bundled into content ask', 'amber']]
          .map(([id, txt, cls]) => { const d = dealById(id); return `
          <div class="list-item" onclick="location.hash='${dealLink(id)}'">
            <span class="chip ${cls}">${esc(d.brand.split(' (')[0])}</span>
            <span style="font-size:13px;color:var(--text-2)">${esc(txt)}</span>
          </div>`; }).join('')}
      </div>
      <div class="card">
        <h3>Do not engage</h3>
        ${scams.map((d) => `
          <div class="list-item" onclick="location.hash='${dealLink(d.deal_id)}'">
            ${scamChip(d.scam_risk)}
            <div style="min-width:0"><b style="font-size:13px">${esc(d.brand)}</b>
            <div style="font-size:12px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.red_flags || d.recommended_action)}</div></div>
          </div>`).join('')}
        <div style="margin-top:10px;font-size:12px;color:var(--text-3)">Kimi is being pitched by two unrelated agencies (NV-0001 / NV-0020) — verify agency of record before quoting either.</div>
      </div>
    </div>

    <div class="section-title">Claude's read <span class="hint">from the audit — data stays underneath, this is just the order of operations</span></div>
    <div class="card" style="border-left:3px solid var(--purple)">
      <div class="kv-grid">
        <div class="k">Respond first</div><div class="v">${respondFirst.map((d) => `<a href="${dealLink(d.deal_id)}">${esc(d.brand.split(' (')[0])}</a>`).join(' · ')} — highest weighted value, all fresh.</div>
        <div class="k">Counter these</div><div class="v">${explicit.map((d) => `<a href="${dealLink(d.deal_id)}">${esc(d.brand)}</a> (${fmt$(d.explicit_cash_usd)} vs ${fmt$(d.market_value_base_usd)} fair value)`).join(' · ')} — both offers sit far below market.</div>
        <div class="k">Clarify rights</div><div class="v">${legal.map((d) => `<a href="${dealLink(d.deal_id)}">${esc(d.brand.split(' (')[0])}</a>`).join(' · ')} — no quote until usage scope, term and territory are in writing.</div>
        <div class="k">Do not engage</div><div class="v">${scams.map((d) => esc(d.brand.split(' (')[0])).join(' · ')} — scam-pattern outreach, no legitimate client named.</div>
        <div class="k">Going stale</div><div class="v">${stale.slice(0, 6).map((d) => `<a href="${dealLink(d.deal_id)}">${esc(d.brand.split(' (')[0])}</a> (${d.days_since_contact}d)`).join(' · ')} — send light re-open checks this week.</div>
        <div class="k">Exceptions pending</div><div class="v">${exceptions.length} deals priced below/outside the $3,000 organic floor are tagged <span class="chip purple">EXCEPTION REQUIRES AARON APPROVAL</span> and stay frozen until you clear them.</div>
      </div>
    </div>`
  };
}

/* ---------------- DEALS LIST ---------------- */
function viewDeals(params) {
  const filter = params.get('filter') || '';
  return {
    title: 'Deals',
    html: `
      <h1 class="page-title">Deals</h1>
      <div class="page-sub">All ${NV.deals.length} opportunities from the audit. Original audit facts are read-only; your working changes layer on top.</div>
      <div class="filters">
        <input type="text" id="f-q" placeholder="Filter…" style="max-width:190px" />
        <select id="f-grade"><option value="">Grade: all</option><option>B</option><option>C</option><option>D</option><option>Reject/Archive</option></select>
        <select id="f-struct"><option value="">Structure: all</option>${Object.keys(NV.dashboard.structureCounts).map((s) => `<option>${esc(s)}</option>`).join('')}</select>
        <select id="f-stage"><option value="">Stage: all</option>${STAGES.map((s) => `<option>${s}</option>`).join('')}</select>
        <select id="f-channel">
          <option value="">Source: all</option>
          <option value="email" ${filter === 'email' ? 'selected' : ''}>Email only</option>
          <option value="manychat" ${filter === 'manychat' ? 'selected' : ''}>ManyChat only</option>
          <option value="both" ${filter === 'both' ? 'selected' : ''}>Email + ManyChat</option>
        </select>
        <select id="f-special">
          <option value="">Flags: all</option>
          <option value="legal" ${filter === 'legal' ? 'selected' : ''}>Legal review</option>
          <option value="counter" ${filter === 'counter' ? 'selected' : ''}>Has cash offer (counter)</option>
          <option value="scam">Scam risk</option>
          <option value="rights">Rights flags</option>
          <option value="nobudget">No budget disclosed</option>
          <option value="exception">Strategic exception</option>
          <option value="stale">Stale (>20d)</option>
          <option value="conflict" ${filter === 'conflict' ? 'selected' : ''}>Channel conflict</option>
          <option value="duplicate" ${filter === 'duplicate' ? 'selected' : ''}>Possible-duplicate related</option>
          <option value="dmlink">ManyChat conversation available</option>
        </select>
        <span class="count" id="f-count"></span>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Deal</th><th>Category</th><th>Grade</th><th>Stage</th><th class="money">Offer</th><th class="money">Opening ask</th><th class="money">Weighted</th><th>Prob</th><th>Days</th><th>Flags</th></tr></thead>
        <tbody id="deals-body"></tbody>
      </table></div>`,
    mount() {
      const body = document.getElementById('deals-body');
      const inputs = ['f-q', 'f-grade', 'f-struct', 'f-stage', 'f-channel', 'f-special'].map((id) => document.getElementById(id));
      const render = () => {
        const [q, g, st, stage, ch, sp] = inputs.map((i) => i.value);
        const ql = q.toLowerCase();
        let list = NV.deals.filter((d) =>
          (!q || (d.brand + d.product + d.agency + d.contact_email + d.deal_id + ' ' + d.manychat_ids.map((m) => { const r = mcById(m); return r ? (r.ig || '') + ' ' + r.contact : ''; }).join(' ')).toLowerCase().includes(ql)) &&
          (!g || d.grade === g) &&
          (!st || d.commercial_structure === st) &&
          (!stage || dealStage(d) === stage) &&
          (!ch || d.source_channel === ch) &&
          (!sp || (
            sp === 'legal' ? d.legal_review === 'YES' :
            sp === 'counter' ? d.explicit_cash_usd > 0 :
            sp === 'scam' ? d.scam_risk !== 'None Observed' :
            sp === 'rights' ? d.rights_flags && d.rights_flags !== 'None detected' :
            sp === 'nobudget' ? d.explicit_cash_usd === 0 && isViable(d) :
            sp === 'exception' ? d.strategic_exception_required === 'Yes' :
            sp === 'stale' ? d.days_since_contact > 20 && isActionable(d) :
            sp === 'conflict' ? mcForDeal(d.deal_id).some((m) => m.channelConflict) :
            sp === 'duplicate' ? mcForDeal(d.deal_id).some((m) => m.classification === 'Possible Duplicate') :
            sp === 'dmlink' ? mcForDeal(d.deal_id).some((m) => m.link) : true))
        );
        list = [...list].sort((a, b) => num(b.prob_weighted_usd) - num(a.prob_weighted_usd));
        document.getElementById('f-count').textContent = `${list.length} of ${NV.deals.length}`;
        body.innerHTML = list.map((d) => `
          <tr data-href="${dealLink(d.deal_id)}" ${rowClick}>
            <td><b>${esc(d.brand)}</b> ${chBadge(d.source_channel)}<br><span style="color:var(--text-3);font-size:11.5px">${esc(d.deal_id)}${d.agency ? ' · via ' + esc(d.agency.split(' (')[0]) : ''}</span></td>
            <td style="font-size:12.5px;color:var(--text-2)">${esc(d.ai_category)}</td>
            <td>${gradeChip(d.grade)}</td>
            <td style="font-size:12.5px">${esc(dealStage(d))}</td>
            <td class="money">${d.explicit_cash_usd > 0 ? `<b>${fmt$(d.explicit_cash_usd)}</b>` : '<span style="color:var(--text-3)">—</span>'}</td>
            <td class="money">${num(d.total_recommended_opening_ask) > 0 ? fmt$(d.total_recommended_opening_ask) : '—'}</td>
            <td class="money">${fmt$(d.prob_weighted_usd)}</td>
            <td class="num">${pct(d.close_probability)}</td>
            <td class="num">${d.days_since_contact === '' || d.days_since_contact == null ? '—' : d.days_since_contact + 'd'}</td>
            <td>${d.legal_review === 'YES' ? '<span class="chip red">Legal</span>' : ''}${scamChip(d.scam_risk)}${d.strategic_exception_required === 'Yes' ? '<span class="chip purple">Exception</span>' : ''}</td>
          </tr>`).join('');
      };
      inputs.forEach((i) => i.addEventListener('input', render));
      render();
    }
  };
}

/* ---------------- PIPELINE ---------------- */
function viewPipeline() {
  const cols = STAGES.map((s) => ({ stage: s, deals: NV.deals.filter((d) => dealStage(d) === s) })).filter((c) => c.deals.length || ['New', 'Response Drafted', 'In Negotiation', 'Won'].includes(c.stage));
  return {
    title: 'Pipeline',
    html: `
      <h1 class="page-title">Pipeline</h1>
      <div class="page-sub">Stages update from the deal page and are kept separate from the imported audit. Weighted totals shown per column.</div>
      <div class="board">
        ${cols.map((c) => `
          <div class="board-col">
            <h4>${esc(c.stage)} <span>${c.deals.length} · ${fmt$(c.deals.reduce((s, d) => s + (d.prob_weighted_usd || 0), 0))}</span></h4>
            ${c.deals.sort((a, b) => num(b.prob_weighted_usd) - num(a.prob_weighted_usd)).map((d) => `
              <div class="board-card" onclick="location.hash='${dealLink(d.deal_id)}'">
                <div class="bc-brand">${esc(d.brand)}</div>
                <div class="bc-val">${d.explicit_cash_usd > 0 ? fmt$(d.explicit_cash_usd) + ' offered · ' : ''}${fmt$(d.prob_weighted_usd)} weighted</div>
                <div class="bc-meta">${chBadge(d.source_channel)}${gradeChip(d.grade)}${d.legal_review === 'YES' ? '<span class="chip red">Legal</span>' : ''}${scamChip(d.scam_risk)}</div>
              </div>`).join('') || '<div class="empty" style="padding:18px">Empty</div>'}
          </div>`).join('')}
      </div>`
  };
}

/* ---------------- DEAL DETAIL ---------------- */
function viewDealDetail(id, params) {
  const d = dealById(id);
  if (!d) return { title: 'Not found', html: '<div class="empty">Deal not found.</div>' };
  const draft = draftByDeal(id);
  const res = researchByDeal(id);
  const tab = params.get('tab') || 'overview';
  const stage = dealStage(d);
  const draftStatus = NVStore.getDraftStatus(id);
  const initials = d.brand.replace(/\(.*/, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const domain = (d.contact_email.split('@')[1] || '').toLowerCase();
  const fu = NV.followups.find((f) => f.dealId === id);

  const TABS = [['overview', 'Overview'], ['negotiation', 'Negotiation'], ['messages', 'Messages'], ['terms', 'Terms'], ['files', 'Files'], ['research', 'Brand Research'], ['activity', 'Activity']];

  const feeRows = [
    ['Organic posting (3-content package)', d.organic_posting_fee],
    ['UGC / production', d.production_fee],
    ['Licensing', d.licensing_fee],
    ['Paid usage', d.paid_usage_fee],
    ['Exclusivity', d.exclusivity_fee]
  ].filter(([, v]) => v > 0);

  const mcRecords = mcForDeal(id);
  const allDrafts = draftsByDeal(id);
  const latestDm = mcRecords.map((m) => m.latestDm).filter(Boolean).sort().pop() || null;
  const preferredChannel = allDrafts.length ? (allDrafts[allDrafts.length - 1].channel === 'dm' ? 'Instagram DM via ManyChat' : 'Email') : (d.source_channel === 'manychat' ? 'Instagram DM via ManyChat' : 'Email');

  const banners = [];
  if (id === 'NV-DEAL-0047' && mcRecords.some((m) => m.channelConflict))
    banners.push(`<div class="banner red"><span>⚠︎</span><div><b>DIRECT BRAND + AGENCY ROUTE — VERIFY REPRESENTATION.</b> Higgsfield's partnerships lead (Abylay, @higgsfield.ai) reached out directly via DM while Heek/BDSJ Media (kavy@bdsjmedia.co) holds the email route. Ask whether the Claude MCP campaign is the same engagement before quoting either side. Preferred contact route: <b>unresolved until Aaron decides</b>. One deal, one valuation — no double-count.</div></div>`);
  if (id === 'NV-DEAL-0028' && mcRecords.some((m) => m.classification === 'Possible Duplicate'))
    banners.push(`<div class="banner amber"><span>⚠︎</span><div><b>POSSIBLE DUPLICATE / AGENCY AUTHORIZATION REQUIRES MANUAL REVIEW.</b> Two additional Dreamina approaches arrived via Instagram DM (${mcRecords.filter((m) => m.classification === 'Possible Duplicate').map((m) => `${esc(m.id)} — ${esc(m.brand)}`).join('; ')}). They are held as related approaches only: no pipeline IDs, no added value, until agency authorization is confirmed against Tec-Do.</div></div>`);
  if (d.source_channel === 'both' && !banners.length)
    banners.push(`<div class="banner blue"><span>◇</span><div><b>Enriched from ManyChat.</b> This email deal also has a live Instagram DM thread — both sources shown below, one deal, one valuation.</div></div>`);

  const twins = activeByBrand(d.brand);
  if (twins.length)
    banners.push(`<div class="banner blue"><span>◎</span><div><b>Also in Active Deals:</b> ${twins.map((a) => `${esc(a.brand)} Round ${a.round} — ${esc(a.stage)}${a.amount ? ' · ' + fmt$(a.amount) : ''}`).join(' · ')}. <a href="#/active">Open Active Deals</a> for delivery/payment state before negotiating here.</div></div>`);
  if (d.scam_risk === 'High' || d.commercial_structure === 'Do-not-engage')
    banners.push(`<div class="banner red"><span>✕</span><div><b>Do not engage.</b> ${esc(d.red_flags || 'Flagged as suspicious during the audit.')}</div></div>`);
  else if (d.scam_risk === 'Medium')
    banners.push(`<div class="banner red"><span>⚠︎</span><div><b>Suspicious.</b> ${esc(d.red_flags)}</div></div>`);
  if (d.legal_review === 'YES')
    banners.push(`<div class="banner red"><span>§</span><div><b>Legal review required.</b> ${esc(d.red_flags || d.key_questions)} <i>(commercial issue-spotting, not legal advice)</i></div></div>`);
  if (d.strategic_exception_required === 'Yes')
    banners.push(`<div class="banner purple"><span>◆</span><div><b>EXCEPTION REQUIRES AARON APPROVAL</b> — this structure sits outside the standard $3,000 organic floor. It stays frozen until you explicitly approve the exception.</div></div>`);
  if (d.minimum_package_applies === 'Yes' && d.strategic_exception_required !== 'Yes')
    banners.push(`<div class="banner blue"><span>▦</span><div><b>Minimum package applies:</b> $1,000/post · 3-post minimum · $3,000 organic floor. Rights and licensing priced separately on top.</div></div>`);

  /* shared cards: communication sources + ManyChat context */
  const commsCard = () => `
      <div class="card">
        <h3>Communication sources ${chBadge(d.source_channel)}</h3>
        <div class="kv-grid">
          ${d.gmail_thread_url ? `<div class="k">Email thread</div><div class="v"><a href="${esc(d.gmail_thread_url)}" target="_blank" rel="noopener">Open in Gmail ↗</a> · ${esc(d.contact_email)}</div>` : ''}
          ${mcRecords.filter((m) => m.classification !== 'Possible Duplicate').map((m) => `
            <div class="k">ManyChat DM</div><div class="v">${m.link ? `<a href="${esc(m.link)}" target="_blank" rel="noopener">Open in ManyChat ↗</a>` : '<span style="color:var(--text-3)">preview only — link not captured</span>'} · ${m.ig ? '@' + esc(m.ig) : esc(m.contact)}</div>`).join('')}
          <div class="k">Preferred reply channel</div><div class="v">${id === 'NV-DEAL-0047' ? '<span class="chip amber">Unresolved — Aaron decides route</span>' : esc(preferredChannel)}</div>
          ${latestDm ? `<div class="k">Latest DM activity</div><div class="v">${esc(latestDm)}</div>` : ''}
          ${d.days_since_contact !== '' && d.days_since_contact != null ? `<div class="k">Latest interaction</div><div class="v">${d.days_since_contact} days ago${latestDm ? ' (email) — use newest across channels' : ''}</div>` : ''}
        </div>
      </div>`;

  const mcCards = () => mcRecords.map((m) => `
      <div class="card" style="border-left:3px solid ${m.classification === 'Possible Duplicate' ? 'var(--amber)' : 'var(--blue)'}">
        <h3>ManyChat — ${esc(m.id)} <span class="chip ${m.classification === 'Possible Duplicate' ? 'amber' : m.classification === 'Needs Manual Review' ? 'red' : m.classification === 'Existing Deal Enriched' ? 'purple' : 'blue'}">${esc(m.classification)}</span></h3>
        <div class="kv-grid">
          <div class="k">Instagram</div><div class="v">${m.ig ? '@' + esc(m.ig) : '(handle not captured)'} · ${esc(m.contact)}</div>
          <div class="k">Dates</div><div class="v">${esc(m.dates)}</div>
          <div class="k">DM summary</div><div class="v">${esc(m.summary)}</div>
          <div class="k">Offer</div><div class="v">${esc(m.offer)}</div>
          ${m.rights && m.rights !== 'TBD' && m.rights !== 'N/A' ? `<div class="k">Rights</div><div class="v"><b style="color:var(--amber)">${esc(m.rights)}</b></div>` : ''}
          <div class="k">Email match</div><div class="v">${esc(m.emailMatch)}</div>
          <div class="k">Recommended</div><div class="v">${esc(m.action)}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          ${m.link ? `<a class="btn sm" href="${esc(m.link)}" target="_blank" rel="noopener">Open in ManyChat ↗</a>` : ''}
          ${draftById(m.draftId) ? `<button class="btn sm" onclick="location.hash='#/deal/${id}?tab=negotiation'">View draft ${esc(m.draftId)}</button>` : ''}
        </div>
      </div>`).join('');

  /* tab bodies */
  const tabBody = {
    overview: () => `
      ${banners.join('')}
      <div class="card">
        <h3>Key facts</h3>
        <div class="kv-grid">
          <div class="k">Product</div><div class="v">${esc(d.product)}</div>
          <div class="k">Category</div><div class="v">${esc(d.ai_category)}</div>
          <div class="k">Agency</div><div class="v">${d.agency ? esc(d.agency) : '<span style="color:var(--text-3)">Direct — no agency</span>'}</div>
          <div class="k">Contact</div><div class="v">${d.contact_email ? `<a href="mailto:${esc(d.contact_email)}">${esc(d.contact_email)}</a>` : mcRecords.length ? esc(mcRecords.map((m) => (m.ig ? '@' + m.ig : m.contact)).join(', ')) : '—'}</div>
          <div class="k">Deal type</div><div class="v">${esc(d.deal_type)}</div>
          <div class="k">Last contact</div><div class="v">${d.days_since_contact} days ago${fu ? ` · follow-up: ${esc(fu.timing)}` : ''}</div>
          <div class="k">Audit score</div><div class="v">${d.total_score}/100 → ${gradeChip(d.grade)} <span class="chip">${esc(d.priority)} priority</span></div>
          <div class="k">Source</div><div class="v"><span class="chip">Imported from audit</span> ${esc(d.record_version)} · ${esc(d.data_last_updated)}</div>
        </div>
      </div>
      ${commsCard()}
      ${mcCards()}
      ${d.red_flags ? `<div class="card"><h3>Red flags noted in audit</h3><div style="font-size:13.5px;color:var(--text-2)">${esc(d.red_flags)}</div></div>` : ''}
      <div class="card">
        <h3>Recommended pricing structure ${estChip()}</h3>
        ${feeRows.length ? `<div class="kv-grid">${feeRows.map(([k, v]) => `<div class="k">${k}</div><div class="v num">${fmt$(v)}</div>`).join('')}</div><hr style="border:none;border-top:1px solid var(--border);margin:12px 0">` : ''}
        <div class="kv-grid">
          <div class="k"><b>Opening ask</b></div><div class="v num"><b>${fmt$(d.total_recommended_opening_ask)}</b></div>
          <div class="k"><b>Minimum acceptable</b></div><div class="v num"><b>${fmt$(d.minimum_acceptable_close)}</b></div>
        </div>
      </div>
      <div class="card">
        <h3>Open questions for the brand</h3>
        <div style="font-size:13.5px;color:var(--text-2)">${esc(d.key_questions)}</div>
      </div>`,

    negotiation: () => {
      const guardrails = `
        <div class="banner purple"><span>◆</span><div><b>Guardrails.</b> Claude drafts and recommends — it never sends, accepts, or concedes. No perpetual usage, no AI-identity rights, no exclusivity grants, no minimums lowered without your explicit approval. Every message below is approval-gated.</div></div>`;
      const position = `
        <div class="card">
          <h3>Current position</h3>
          <div class="kv-grid">
            <div class="k">Brand's offer</div><div class="v">${d.explicit_cash_usd > 0 ? `<b>${fmt$(d.explicit_cash_usd)}</b> <span class="chip green">Stated by brand</span>` : '<span style="color:var(--text-3)">No budget disclosed yet</span>'}</div>
            <div class="k">Recommended ask</div><div class="v num"><b>${fmt$(d.total_recommended_opening_ask)}</b> ${estChip()}</div>
            <div class="k">Target close</div><div class="v num">${fmt$(d.likely_close_usd)} ${estChip()}</div>
            <div class="k">Floor (never below)</div><div class="v num"><b>${fmt$(d.minimum_acceptable_close)}</b></div>
            <div class="k">Fair market value</div><div class="v num">${fmt$(d.market_value_base_usd)} ${estChip()}</div>
            <div class="k">Unpriced rights value</div><div class="v num">${d.hidden_rights_usd > 0 ? fmt$(d.hidden_rights_usd) + ' — price separately' : '—'}</div>
            <div class="k">Close probability</div><div class="v">${pct(d.close_probability)}<div class="prob-bar" style="max-width:180px"><div style="width:${d.close_probability * 100}%"></div></div></div>
          </div>
        </div>`;
      const p = d.close_probability;
      const standardCard = `
        <div class="card" style="border-left:3px solid ${p != null && p >= STANDARD.target ? 'var(--green)' : 'var(--amber)'}">
          <h3>The 50% Standard
            ${p == null ? '<span class="chip">Not yet scored</span>' : p >= STANDARD.target ? `<span class="chip green">At standard — ${pct(p)}</span>` : `<span class="chip amber">Below standard — ${pct(p)} → target ${pct(STANDARD.target)}</span>`}
          </h3>
          <div style="font-size:12.5px;color:var(--text-2);margin-bottom:10px">Every viable negotiation gets engineered toward a ≥50% close. The number moves by applying levers — never by editing it. Update the working probability in your notes as levers land.</div>
          ${STANDARD.levers.map((l) => {
            const st = l.auto ? l.auto(d) : null;
            return `<div class="list-item" style="cursor:default">
              <span class="chip ${st === true ? 'green' : st === false ? 'amber' : ''}">${st === true ? '✓' : st === false ? '○' : '·'}</span>
              <div style="min-width:0"><b style="font-size:13px">${l.label}</b>
              <div style="font-size:12px;color:var(--text-3)">${l.why}</div></div>
            </div>`;
          }).join('')}
        </div>`;
      const rec = `
        <div class="card" style="border-left:3px solid var(--purple)">
          <h3>Claude's recommendation <span class="chip purple">Generated by Claude</span></h3>
          <div class="kv-grid">
            <div class="k">The move</div><div class="v">${esc(d.recommended_action)}</div>
            <div class="k">Why</div><div class="v">${d.explicit_cash_usd > 0 ? `Their ${fmt$(d.explicit_cash_usd)} sits ${Math.round((1 - d.explicit_cash_usd / (d.market_value_base_usd || 1)) * 100)}% below fair value (${fmt$(d.market_value_base_usd)}). ` : 'No budget disclosed — get scope and budget before quoting beyond the standard package. '}Anchor at ${fmt$(d.total_recommended_opening_ask)}; hold the ${fmt$(d.minimum_acceptable_close)} floor.</div>
            <div class="k">Don't concede</div><div class="v">${d.rights_flags !== 'None detected' ? `Rights on the table (${esc(d.rights_flags)}) are priced separately — never bundled. ` : ''}The 3-post minimum, separate rights pricing, and Noe's likeness/AI-identity protections.</div>
            <div class="k">Can trade</div><div class="v">Deliverable count vs. price, posting timeline, platform mix, shorter usage windows in exchange for budget movement.</div>
            <div class="k">Ask the brand</div><div class="v">${esc(d.key_questions)}</div>
            <div class="k">Likelihood</div><div class="v">${pct(d.close_probability)} — weighted value ${fmt$(d.prob_weighted_usd)}</div>
          </div>
          <div style="margin-top:12px;font-size:12px;color:var(--text-3)">To iterate on strategy or regenerate this draft in your voice, work with Claude in Cowork — the repo and this deal's full context are already wired in. Edits you approve become voice examples below.</div>
        </div>`;
      const draftBlock = allDrafts.length ? allDrafts.map((dr) => `
        <div class="section-title">Draft response ${chBadgeDraft(dr.channel)} <span class="hint">${esc(dr.responseType)}</span></div>
        ${renderDraft(dr, d)}`).join('') : `
        <div class="card"><div class="empty">No draft — this deal is marked ${esc(d.commercial_structure)}. ${d.commercial_structure === 'Do-not-engage' ? 'Do not respond.' : ''}</div></div>`;
      return guardrails + position + standardCard + rec + draftBlock;
    },

    messages: () => `
      ${commsCard()}
      ${mcCards()}
      ${allDrafts.length ? allDrafts.map((dr) => `<div class="section-title">Prepared reply ${chBadgeDraft(dr.channel)}</div>${renderDraft(dr, d)}`).join('') : '<div class="card"><div class="empty">No prepared reply for this deal.</div></div>'}
      <div class="card" style="margin-top:14px">
        <h3>Log a brand reply</h3>
        <div style="font-size:12.5px;color:var(--text-3);margin-bottom:8px">Paste what the brand said — it lands in the activity history, and Claude uses it as context for the next counter.</div>
        <textarea id="brand-reply" placeholder="Brand's response…"></textarea>
        <div style="margin-top:9px"><button class="btn" id="log-reply">Log reply</button></div>
      </div>`,

    terms: () => {
      const flags = d.rights_flags !== 'None detected' ? d.rights_flags.split(';').map((f) => f.trim()) : [];
      const FLAG_INFO = {
        perpetual: ['Perpetual usage', 'red', 'Indefinite license. Never under a standard fee — rate card premium $2,500–$10,000, heavily discouraged.'],
        whitelist: ['Whitelisting / Spark Ads', 'amber', 'Brand runs ads from Noe\'s handle. $600–$2,000 per 30 days, separate line item.'],
        licens: ['Content licensing', 'amber', 'Brand use of the content off Noe\'s channels. Priced by duration/territory.'],
        exclusiv: ['Exclusivity', 'amber', 'Category lockout. $500–$2,000 per 30 days.'],
        'spark ad': ['Spark Ads', 'amber', 'Paid amplification from creator handle — separate fee.'],
        global: ['Global territory', 'amber', 'Worldwide rights uplift $300–$1,200.'],
        likeness: ['Likeness / synthetic media', 'red', 'AI-identity rights. Never bundled. 3–10x content fee baseline; usually declined.'],
        voice: ['Voice rights', 'red', 'Voice/AI-voice use. Same treatment as likeness — separate legal + commercial negotiation.'],
        'raw footage': ['Raw footage', 'amber', 'Source assets handover $400–$1,200.'],
        advertising: ['Paid advertising use', 'amber', 'Paid-media usage — priced by flight length.'],
        competitor: ['Competitor-priority clause', 'red', 'Open-ended competitor restriction — narrow or strike.']
      };
      return `
      ${banners.join('')}
      <div class="card">
        <h3>Rights signals detected in this thread</h3>
        ${flags.length ? flags.map((f) => {
          const info = FLAG_INFO[f] || [f, 'amber', 'Review this term before quoting.'];
          return `<div class="list-item" style="cursor:default"><span class="chip ${info[1]}">${esc(info[0])}</span><span style="font-size:13px;color:var(--text-2)">${esc(info[2])}</span></div>`;
        }).join('') : '<div class="empty" style="padding:18px">No rights language detected in the audit scan.</div>'}
      </div>
      <div class="card">
        <h3>Commercial terms (working understanding)</h3>
        <div class="kv-grid">
          <div class="k">Structure</div><div class="v">${structChip(d.commercial_structure)}</div>
          <div class="k">Compensation</div><div class="v">${d.explicit_cash_usd > 0 ? fmt$(d.explicit_cash_usd) + ' offered by brand' : 'Not yet stated'}</div>
          <div class="k">Deliverables</div><div class="v">${esc(d.deal_type)}${d.minimum_package_applies === 'Yes' ? ' — quoted as 3-content package' : ''}</div>
          <div class="k">Usage rights</div><div class="v">${flags.length ? 'Requested — price separately (see above)' : 'Organic only (nothing else requested yet)'}</div>
          <div class="k">Exclusivity</div><div class="v">${flags.some((f) => f.startsWith('exclusiv')) ? 'Requested — needs narrowing + fee' : 'None requested'}</div>
          <div class="k">Contract</div><div class="v">Not received — when it lands, attach it in Files and Claude will run the term-by-term comparison</div>
        </div>
      </div>
      <div class="banner amber"><span>§</span><div>This is commercial issue-spotting from the audit, not legal advice. Material terms should be verified against the actual contract.</div></div>`;
    },

    files: () => `
      <div class="card">
        <h3>Files for this deal</h3>
        <div class="empty" style="padding:26px">
          No files attached yet.<br><br>
          <span style="font-size:12.5px">When a campaign brief, contract or SOW arrives, drop it in Google Drive and tell Claude in Cowork —
          it will read the document, extract compensation, deliverables, usage rights, exclusivity, AI-identity clauses and deadlines,
          compare them against this deal's working terms, and flag every material difference here.</span>
        </div>
      </div>
      <div class="card">
        <h3>What gets extracted from contracts</h3>
        <div style="font-size:13px;color:var(--text-2);line-height:1.7">Compensation · Deliverables · Deadlines · Revision limits · Payment terms · Cancellation · Usage rights · Paid media · Whitelisting · Territory · Duration · Exclusivity · Ownership · Raw footage · Work-for-hire · Name & likeness · Voice · AI training · Synthetic media · Indemnity · Morality · Confidentiality · Non-disparagement · Governing law · Renewal · Termination</div>
      </div>`,

    research: () => res ? `
      <div class="card">
        <h3>Brand research <span class="chip">Deep research — priority brand</span></h3>
        <div class="kv-grid">
          <div class="k">Domain</div><div class="v">${esc(res.domain)}</div>
          <div class="k">Legitimacy</div><div class="v">${esc(res.domainLegitimacy)}</div>
          <div class="k">Company</div><div class="v">${esc(res.company)}</div>
          <div class="k">Scale / funding</div><div class="v">${esc(res.scale)}</div>
          <div class="k">Reputation</div><div class="v">${esc(res.reputation)}</div>
          <div class="k">Competitors</div><div class="v">${esc(res.competitors)}</div>
          <div class="k">Fit with Noe</div><div class="v">${esc(res.fit)}</div>
          <div class="k">Notes</div><div class="v">${esc(res.notes)}</div>
        </div>
      </div>` : `
      <div class="card">
        <h3>Baseline legitimacy check <span class="chip">From audit</span></h3>
        <div class="kv-grid">
          <div class="k">Sender domain</div><div class="v">${esc(domain)}</div>
          <div class="k">Scam risk</div><div class="v">${esc(d.scam_risk)}</div>
          <div class="k">Category</div><div class="v">${esc(d.ai_category)}</div>
          <div class="k">Red flags</div><div class="v">${esc(d.red_flags) || 'None noted'}</div>
        </div>
        <div style="margin-top:10px;font-size:12.5px;color:var(--text-3)">Not one of the 18 deep-researched priority brands. Ask Claude in Cowork to run a full research pass if this heats up.</div>
      </div>`,

    activity: () => {
      const ops = NVStore.getActivity(id);
      const seeded = [
        draft ? { ts: null, icon: '✎', title: `Response drafted (${draft.id})`, meta: 'Generated by Claude · v3.0 audit · HOLD — review before sending' } : null,
        { ts: null, icon: '◎', title: 'Scored & valued in Pass 2', meta: `Calculated by system · ${d.total_score}/100, grade ${d.grade}, weighted ${fmt$(d.prob_weighted_usd)}` },
        { ts: null, icon: '⤓', title: 'Imported from Gmail audit', meta: `Imported from audit · ${esc(d.data_last_updated)} · thread last active ${d.days_since_contact}d before import` }
      ].filter(Boolean);
      return `
      <div class="card">
        <h3>Activity</h3>
        <ul class="timeline">
          ${ops.map((a) => `
            <li><div class="tl-dot">${a.type === 'note' ? '✎' : a.type === 'stage' ? '⇄' : a.type === 'draft' ? '✉' : a.type === 'reply' ? '↩' : a.type === 'voice' ? '♪' : '•'}</div>
              <div class="tl-body">
                <div class="tl-title">${esc(a.title)}</div>
                <div class="tl-meta">${esc(a.source)} · ${timeAgo(a.ts)}</div>
                ${a.prev ? `<div class="tl-detail">${esc(a.prev)} → <b>${esc(a.next)}</b>${a.reason ? ' — ' + esc(a.reason) : ''}</div>` : ''}
                ${a.detail ? `<div class="tl-detail">${esc(a.detail)}</div>` : ''}
              </div></li>`).join('')}
          ${seeded.map((a) => `
            <li><div class="tl-dot">${a.icon}</div>
              <div class="tl-body"><div class="tl-title">${a.title}</div><div class="tl-meta">${a.meta}</div></div></li>`).join('')}
        </ul>
      </div>`;
    }
  };

  return {
    title: d.brand,
    html: `
    <div class="deal-header">
      <div class="avatar">${esc(initials)}</div>
      <div style="min-width:0;flex:1">
        <div class="deal-title">${esc(d.brand)}</div>
        <div class="deal-subtitle">${esc(d.product)} · ${esc(d.deal_id)}</div>
        <div class="deal-chips">
          ${chBadge(d.source_channel)}
          ${gradeChip(d.grade)}
          <span class="chip">${esc(d.priority)} priority</span>
          ${structChip(d.commercial_structure)}
          <span class="chip blue">${esc(stage)}</span>
          ${d.legal_review === 'YES' ? '<span class="chip red">Legal review</span>' : ''}
          ${scamChip(d.scam_risk)}
          ${d.strategic_exception_required === 'Yes' ? '<span class="chip purple">Exception — needs Aaron</span>' : ''}
        </div>
      </div>
    </div>
    <div class="segmented" role="tablist">
      ${TABS.map(([k, lbl]) => `<button class="${k === tab ? 'active' : ''}" onclick="location.hash='#/deal/${id}?tab=${k}'">${lbl}</button>`).join('')}
    </div>
    <div class="deal-layout">
      <div class="deal-content">${tabBody[tab] ? tabBody[tab]() : tabBody.overview()}</div>
      <div class="inspector">
        <div class="card">
          <h3 style="margin-bottom:4px">Deal inspector</h3>
          <div class="ins-row"><span class="k">Current ask</span><span class="v">${fmt$(d.total_recommended_opening_ask)}</span></div>
          <div class="ins-row"><span class="k">Target close</span><span class="v">${fmt$(d.likely_close_usd)}</span></div>
          <div class="ins-row"><span class="k">Minimum close</span><span class="v">${fmt$(d.minimum_acceptable_close)}</span></div>
          <div class="ins-row"><span class="k">Weighted value</span><span class="v">${fmt$(d.prob_weighted_usd)}</span></div>
          <div class="ins-row" style="display:block"><span class="k">Close probability — ${pct(d.close_probability)}</span><div class="prob-bar"><div style="width:${d.close_probability * 100}%"></div></div></div>
          <div class="ins-row"><span class="k">Next follow-up</span><span class="v" style="font-size:11.5px;font-weight:500">${fu ? esc(fu.timing.replace(/\s*\(.*\)/, '')) : '—'}</span></div>
          <div class="ins-row"><span class="k">Draft</span><span class="v" style="font-size:12px">${draftStatus ? esc(draftStatus) : draft ? 'Awaiting approval' : 'None'}</span></div>
          <div class="ins-row"><span class="k">Legal review</span><span class="v">${d.legal_review === 'YES' ? '<span class="chip red">Required</span>' : 'No'}</span></div>
          <div class="ins-row"><span class="k">Owner</span><span class="v">Aaron</span></div>
        </div>
        <div class="card" style="margin-top:12px">
          <h3>Work with Claude</h3>
          <button class="btn primary" id="copy-context" style="width:100%;justify-content:center">Copy briefing for Claude</button>
          <div style="font-size:11.5px;color:var(--text-3);margin-top:8px">Full deal context — position, rules, your voice, the draft, notes — packaged for one paste into Claude. Add the brand's latest message at the bottom and ask for the counter.</div>
        </div>
        <div class="card" style="margin-top:12px">
          <h3>Stage</h3>
          <select id="stage-select">${STAGES.map((s) => `<option ${s === stage ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <div style="font-size:11.5px;color:var(--text-3);margin-top:7px">Changes are logged with before/after — the audit record underneath is never overwritten.</div>
        </div>
        <div class="card" style="margin-top:12px">
          <h3>Notes</h3>
          <textarea id="note-input" placeholder="Add a note…" style="min-height:56px"></textarea>
          <div style="margin-top:8px"><button class="btn sm" id="add-note">Add note</button></div>
          <div id="notes-list" style="margin-top:6px">
            ${NVStore.getNotes(id).slice(0, 4).map((n) => `<div class="note-item">${esc(n.text)}<div class="note-meta">${timeAgo(n.ts)}</div></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`,
    mount() {
      document.getElementById('stage-select')?.addEventListener('change', (e) => {
        NVStore.setStage(id, e.target.value);
        toast(`Stage → ${e.target.value}`);
        renderRoute();
      });
      document.getElementById('add-note')?.addEventListener('click', () => {
        const ta = document.getElementById('note-input');
        if (ta.value.trim()) { NVStore.addNote(id, ta.value.trim()); toast('Note added'); renderRoute(); }
      });
      document.getElementById('copy-context')?.addEventListener('click', () => {
        copyText(buildClaudeContext(id), 'Briefing copied — paste to Claude with the brand\'s reply');
      });
      document.getElementById('log-reply')?.addEventListener('click', () => {
        const ta = document.getElementById('brand-reply');
        if (ta.value.trim()) {
          NVStore.get().deals[id] = NVStore.get().deals[id] || { stage: null, draftStatus: null, notes: [], activity: [], voiceMarks: {} };
          NVStore.get().deals[id].activity.unshift({ ts: new Date().toISOString(), source: 'Stated by brand', type: 'reply', title: 'Brand replied', detail: ta.value.trim() });
          NVStore.setStage(id, 'In Negotiation', 'Brand replied');
          toast('Reply logged — stage moved to In Negotiation');
          renderRoute();
        }
      });
      bindDraftActions(id);
    }
  };
}

/* THE 50% STANDARD — every viable negotiation is engineered toward >=50% close probability.
 * Probabilities are never edited to hit the number; the levers below move the real odds.
 * Aaron updates the working probability from the deal page as levers land. */
const STANDARD = {
  target: 0.5,
  levers: [
    { key: 'speed', label: 'Respond within 48h', why: 'Fresh threads close at a multiple of stale ones. Every viable inbound gets an answer inside two days.', auto: (d) => num(d.days_since_contact) <= 2 || !!NVStore.getDraftStatus(d.deal_id) },
    { key: 'budget', label: 'Budget surfaced in exchange #1', why: 'Never quote blind. First reply always asks for budget + scope — you price the second message, not the first.', auto: (d) => d.explicit_cash_usd > 0 },
    { key: 'anchor', label: 'Anchor with the package', why: 'State the 3-post / $3,000 floor confidently. Anchors set the range; apologetic pricing kills probability.', auto: (d) => num(d.total_recommended_opening_ask) > 0 },
    { key: 'twopath', label: 'Two-path close (scope down, never price down)', why: 'Offer Package A (full) and Package B (reduced deliverables or shorter rights). A choice between two yeses beats yes/no.', auto: null },
    { key: 'rights', label: 'Rights unbundled', why: 'Usage, whitelisting, exclusivity priced separately — protects value and creates trade room for the close.', auto: (d) => !d.rights_flags || d.rights_flags === 'None detected' || num(d.licensing_fee) + num(d.paid_usage_fee) + num(d.exclusivity_fee) > 0 },
    { key: 'deadline', label: 'Deadline on every quote', why: 'Quotes carry a validity window or a scheduling anchor ("locking July slots this week"). Open-ended offers drift to zero.', auto: null },
    { key: 'dm', label: 'Decision-maker verified', why: 'Confirm the contact can sign — agency authority checked before terms move.', auto: null },
    { key: 'nextstep', label: 'Every message ends with a next step', why: 'A concrete question or CTA in every send. No message ends flat.', auto: null }
  ]
};

/* Full negotiation briefing for Claude — one paste gives complete deal context */
function buildClaudeContext(id) {
  const d = dealById(id);
  const drafts = draftsByDeal(id);
  const draft = drafts[0];
  const mcs = mcForDeal(id);
  const res = researchByDeal(id);
  const vp = NVStore.getVoiceProfile();
  const notes = NVStore.getNotes(id);
  const activity = NVStore.getActivity(id).slice(0, 12);
  const lib = NVStore.getVoiceLibrary().map((v) => draftById(v.draftId)).filter(Boolean);
  return `# Negotiation briefing — ${d.brand} (${d.deal_id})

You are drafting as Aaron, manager of Noe Varner's brand partnerships. Recommend strategy and write the reply, but never send, accept terms, or concede rights — Aaron approves everything.

## Deal
- Product: ${d.product} (${d.ai_category})
- Agency: ${d.agency || 'none — direct'}
- Contact: ${d.contact_email || mcs.map((m) => (m.ig ? '@' + m.ig : m.contact)).join(', ') || 'unknown'}
- Source channel: ${CH_TITLE[d.source_channel]}${d.source_channel === 'both' ? ' — one deal, both threads; do not double-count value' : ''}
- Type/structure: ${d.deal_type} / ${d.commercial_structure}
- Audit: ${d.total_score}/100, grade ${d.grade}, ${d.priority} priority, stage ${dealStage(d)}
- Last contact: ${d.days_since_contact} days ago
- Red flags: ${d.red_flags || 'none noted'}
- Rights signals: ${d.rights_flags}
- Scam risk: ${d.scam_risk} · Legal review: ${d.legal_review}

## Position (USD)
- Brand's stated offer: ${d.explicit_cash_usd > 0 ? d.explicit_cash_usd : 'none disclosed'}
- Recommended opening ask: ${d.total_recommended_opening_ask} (organic ${d.organic_posting_fee} / production ${d.production_fee} / licensing ${d.licensing_fee} / paid usage ${d.paid_usage_fee} / exclusivity ${d.exclusivity_fee})
- Target close: ${d.likely_close_usd} · Floor (never below): ${d.minimum_acceptable_close}
- Fair market: ${d.market_value_base_usd} · Unpriced rights value: ${d.hidden_rights_usd}
- Close probability: ${d.close_probability} → weighted ${d.prob_weighted_usd}
- Strategic exception required: ${d.strategic_exception_required}
- Open questions: ${d.key_questions}
- Recommended action: ${d.recommended_action}

## Brand research
${res ? `${res.company}\nDomain: ${res.domain} (${res.domainLegitimacy})\nReputation: ${res.reputation} · Fit: ${res.fit}\nNote: ${res.notes}` : `Baseline only — domain ${d.contact_email.split('@')[1]}, scam risk ${d.scam_risk}.`}

## Hard rules
- $1,000/post minimum, 3-post minimum, $3,000 minimum organic package.
- Paid usage, licensing, whitelisting, exclusivity: separate line items, never bundled.
- No perpetual usage under a standard fee. AI likeness/voice/training rights: separate legal + commercial negotiation, 3–10x baseline, usually declined.
- Anything below the floor must be labeled EXCEPTION REQUIRES AARON APPROVAL.
- Do not reveal internal minimums, fabricate performance, or claim competing offers.

## Aaron's voice
${vp.traits}
Style: ${vp.sentences}
Greeting: ${vp.greeting} · Sign-off: ${vp.signoff.replace(/\n/g, ' / ')}
Never use: ${vp.banned}
${lib.length ? `\n## Approved voice examples (match these over everything else)\n${lib.slice(0, 2).map((x) => `---\nSubject: ${x.subject}\n${x.body}`).join('\n')}` : ''}

${mcs.length ? `## ManyChat DM context\n${mcs.map((m) => `${m.id} [${m.classification}] @${m.ig || '?'} (${m.contact}) — ${m.dates}\nSummary: ${m.summary}\nOffer: ${m.offer}${m.rights && m.rights !== 'TBD' ? `\nRights requested: ${m.rights}` : ''}\nAudit action: ${m.action}`).join('\n---\n')}\nDM style note: DM replies must be short, natural, and direct — no email formality, no signature block.\n` : ''}
## Prepared drafts (all on hold)
${drafts.length ? drafts.map((dr) => `[${dr.channel.toUpperCase()}] ${dr.id} — ${dr.subject}\n${dr.body}`).join('\n---\n') : '(no draft — ' + d.commercial_structure + ')'}

${notes.length ? `## Aaron's notes\n${notes.map((n) => '- ' + n.text).join('\n')}` : ''}
${activity.length ? `## Recent activity\n${activity.map((a) => `- [${a.source}] ${a.title}${a.detail ? ': ' + a.detail : ''}`).join('\n')}` : ''}

## The 50% Standard (apply to every reply)
Engineer this deal toward a >=50% close probability using levers, never by inflating numbers:
respond fast; surface budget in the first exchange (never quote blind); anchor confidently with the package; close with two paths (scope down, never price down); keep rights unbundled as trade room; put a validity window or scheduling anchor on every quote; verify the decision-maker/agency authority; end every message with a concrete next step. Current audited probability: ${d.close_probability ?? 'not scored'}.

## Task
Analyze the brand's latest message (pasted below), tell Aaron: what they're asking, what changed, what it's worth, the exact counter and why, what not to concede, what to trade, push/hold/accept/clarify/walk, close likelihood, main risk. Then write the reply in Aaron's voice (short and natural if DM) with subject line (email only), recommended counter amount, protected terms, and internal notes. State which 50%-standard levers the reply applies.

BRAND'S LATEST MESSAGE:
[paste here]`;
}

/* draft renderer + approval-gated actions (no send button by design) */
function renderDraft(draft, d) {
  const status = NVStore.getDraftStatus(d.deal_id);
  const mark = NVStore.getVoiceMark(d.deal_id, draft.id);
  const isDm = draft.channel === 'dm';
  const mcLink = isDm ? (mcForDeal(d.deal_id).find((m) => m.link) || {}).link : null;
  return `
  <div class="draft-box" id="draft-${esc(draft.id)}">
    <div class="draft-head">
      <div>
        <div class="draft-subject">${esc(draft.subject)} ${chBadgeDraft(draft.channel)}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:2px">To: ${esc(draft.recipient)} · ${esc(draft.id)} · <span class="chip amber">${esc(draft.doNotSendUntil || 'HOLD — review before sending')}</span>${status ? ` <span class="chip ${status === 'Approved internally' ? 'green' : 'blue'}">${esc(status)}</span>` : ''}</div>
      </div>
      ${draft.exception ? '<span class="chip purple">EXCEPTION REQUIRES AARON APPROVAL</span>' : ''}
    </div>
    <div class="draft-body">${esc(draft.body)}</div>
    <div class="draft-actions">
      <button class="btn sm primary" data-act="copy" data-draft="${esc(draft.id)}">${isDm ? 'Copy DM' : 'Copy draft'}</button>
      ${mcLink ? `<a class="btn sm" href="${esc(mcLink)}" target="_blank" rel="noopener">Open ManyChat ↗</a>` : ''}
      <button class="btn sm" data-act="approve" data-draft="${esc(draft.id)}">Approve internally</button>
      <button class="btn sm" data-act="sent" data-draft="${esc(draft.id)}">Mark as sent manually</button>
      <select class="voice-mark" data-draft="${esc(draft.id)}" style="width:auto;font-size:12px;padding:4px 8px">
        <option value="">Voice feedback…</option>
        ${['Approved Voice Example', 'Strong Example', 'Do Not Learn', 'Too Formal', 'Too Soft', 'Too Aggressive', 'Too Long', 'Sounds Like AI'].map((v) => `<option ${mark === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <span style="margin-left:auto;font-size:11.5px;color:var(--text-3);align-self:center">No send button by design — sending happens in Gmail, by you.</span>
    </div>
  </div>`;
}
function bindDraftActions(dealId) {
  document.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const draft = draftById(btn.dataset.draft);
      if (!draft) return;
      if (btn.dataset.act === 'copy') copyText(draft.channel === 'dm' ? draft.body : `Subject: ${draft.subject}\n\n${draft.body}`, draft.channel === 'dm' ? 'DM copied — paste into ManyChat/Instagram' : 'Draft copied — paste into Gmail');
      if (btn.dataset.act === 'approve') { NVStore.setDraftStatus(draft.dealId, 'Approved internally'); toast('Approved internally'); renderRoute(); }
      if (btn.dataset.act === 'sent') { NVStore.setDraftStatus(draft.dealId, 'Sent manually'); NVStore.setStage(draft.dealId, 'In Negotiation', 'Response sent'); toast('Marked sent — stage moved to In Negotiation'); renderRoute(); }
    });
  });
  document.querySelectorAll('.voice-mark').forEach((sel) => {
    sel.addEventListener('change', () => {
      const draft = draftById(sel.dataset.draft);
      if (draft && sel.value) { NVStore.markVoice(draft.dealId, draft.id, sel.value); toast(`Voice: ${sel.value}`); }
    });
  });
}

/* ---------------- NEGOTIATIONS ---------------- */
function viewNegotiations() {
  const active = NV.deals.filter(isActionable).sort((a, b) => num(b.prob_weighted_usd) - num(a.prob_weighted_usd));
  return {
    title: 'Negotiations',
    html: `
      <h1 class="page-title">Negotiations</h1>
      <div class="page-sub">Every active table, ordered by weighted value. Open one for the full workspace — position, recommendation, and the approval-gated draft.</div>
      <div class="banner purple"><span>◆</span><div><b>How this works:</b> Claude prepares strategy and drafts from the complete deal context (history, research, rate card, rights, your voice). You review, edit, approve, and send from Gmail. Claude cannot send, accept, or concede anything.</div></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Deal</th><th>Grade</th><th class="money">Their offer</th><th class="money">Our ask</th><th class="money">Floor</th><th class="money">Gap</th><th>Prob</th><th>Draft</th><th>Next move</th></tr></thead>
        <tbody>
        ${active.map((d) => {
          const gap = d.explicit_cash_usd > 0 ? d.total_recommended_opening_ask - d.explicit_cash_usd : null;
          const ds = NVStore.getDraftStatus(d.deal_id);
          return `
          <tr data-href="#/deal/${d.deal_id}?tab=negotiation" ${rowClick}>
            <td><b>${esc(d.brand)}</b> ${chBadge(d.source_channel)}<br><span style="color:var(--text-3);font-size:11.5px">${esc(d.deal_id)}</span></td>
            <td>${gradeChip(d.grade)}</td>
            <td class="money">${d.explicit_cash_usd > 0 ? fmt$(d.explicit_cash_usd) : '<span style="color:var(--text-3)">—</span>'}</td>
            <td class="money">${fmt$(d.total_recommended_opening_ask)}</td>
            <td class="money">${fmt$(d.minimum_acceptable_close)}</td>
            <td class="money">${gap != null ? `<b style="color:var(--amber)">+${fmt$(gap).slice(1)}</b>` : '—'}</td>
            <td class="num">${pct(d.close_probability)}</td>
            <td>${ds ? `<span class="chip ${ds === 'Approved internally' ? 'green' : 'blue'}">${esc(ds)}</span>` : draftByDeal(d.deal_id) ? '<span class="chip amber">Ready for review</span>' : '<span class="chip">None</span>'}</td>
            <td style="font-size:12.5px;color:var(--text-2);max-width:230px">${esc(d.recommended_action)}</td>
          </tr>`; }).join('')}
        </tbody>
      </table></div>`
  };
}

/* ---------------- ACTIVE DEALS (Airtable — execution stage) ---------------- */
const STAGE_COLOR = { 'Lead': 'amber', 'Negotiating': 'amber', 'Payment Received': 'green', 'Creating': 'blue', 'Needs Approval': 'purple', 'Approved': 'green', 'Posted': 'blue', 'Payment 2 Collected': 'green', 'Follow Up': 'amber', 'DEAD': 'red' };
const stageChip = (s) => `<span class="chip ${STAGE_COLOR[s] || ''}">${esc(s)}</span>`;
const activeByBrand = (brand) => (NV.active?.deals || []).filter((a) => brand.toLowerCase().includes(a.brand.toLowerCase().split(' ')[0]) || a.brand.toLowerCase().includes(brand.toLowerCase().split(' ')[0]));

function viewActive() {
  const A = NV.active.deals;
  const live = A.filter((a) => a.stage !== 'DEAD');
  const collected = A.reduce((s, a) => s + (a.received || 0), 0);
  const outstanding = live.reduce((s, a) => s + Math.max(0, (a.amount || 0) - (a.received || 0)), 0);
  const assetsRemaining = live.reduce((s, a) => s + (a.assets.totalRemaining || 0), 0);
  const linkify = (t) => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" onclick="event.stopPropagation()">$1</a>');

  const row = (a, i) => {
    const out = a.amount != null ? Math.max(0, a.amount - (a.received || 0)) : null;
    const prog = a.assets.totalRequired ? `${a.assets.totalRequired - a.assets.totalRemaining}/${a.assets.totalRequired}` : '—';
    return `
    <tr data-exp="${i}" style="cursor:pointer">
      <td><b>${esc(a.brand)}</b>${a.round > 1 ? ` <span class="chip blue">Round ${a.round}</span>` : ''}<br><span style="color:var(--text-3);font-size:11.5px">${esc(a.source)}</span></td>
      <td>${stageChip(a.stage)}</td>
      <td class="money">${a.amount != null ? fmt$(a.amount) : '<span class="chip amber">Unconfirmed</span>'}</td>
      <td class="money" style="color:var(--green)">${a.received ? fmt$(a.received) : '—'}</td>
      <td class="money">${out ? `<b style="color:var(--amber)">${fmt$(out)}</b>` : out === 0 ? '<span class="chip green">Paid in full</span>' : '—'}</td>
      <td class="num">${prog}</td>
      <td class="num" style="font-size:12px">${a.affiliatePct ? Math.round(a.affiliatePct * 100) + '%' : '—'}</td>
      <td style="font-size:12px;color:var(--text-3)">${a.nextPaymentDue || '—'}</td>
    </tr>
    <tr class="exp-row" id="exp-${i}" hidden><td colspan="8" style="background:var(--surface-2)">
      <div class="kv-grid" style="padding:6px 2px">
        ${a.deliverables ? `<div class="k">Deliverables</div><div class="v" style="white-space:pre-wrap">${linkify(a.deliverables)}</div>` : ''}
        ${a.notes ? `<div class="k">Notes</div><div class="v" style="white-space:pre-wrap">${linkify(a.notes)}</div>` : ''}
        ${a.postedUrls ? `<div class="k">Posted</div><div class="v" style="white-space:pre-wrap">${linkify(a.postedUrls)}</div>` : ''}
        ${a.affiliateLink ? `<div class="k">Affiliate link</div><div class="v">${linkify(a.affiliateLink)}</div>` : ''}
        <div class="k">Airtable</div><div class="v"><span class="chip">Imported from Airtable · ${esc(a.id)}</span></div>
      </div>
    </td></tr>`;
  };

  return {
    title: 'Active Deals',
    html: `
      <h1 class="page-title">Active Deals</h1>
      <div class="page-sub">Execution-stage deals from Airtable (Content System → Brand Deals) — the ones actually running, separate from the ${NV.deals.length} audited inbound offers. Synced ${esc(NV.active.syncedAt)}; new DM deals appear on next sync.</div>
      <div class="grid cols-4">
        <div class="card kpi"><div class="kpi-label">Cash collected <span class="chip green">CONFIRMED</span></div><div class="kpi-value">${fmt$(collected)}</div><div class="kpi-note">Actual payments received across all rounds.</div></div>
        <div class="card kpi"><div class="kpi-label">Outstanding on live deals <span class="chip green">CONFIRMED</span></div><div class="kpi-value">${fmt$(outstanding)}</div><div class="kpi-note">Contracted balance still to collect (excludes DEAD).</div></div>
        <div class="card kpi"><div class="kpi-label">Live deals</div><div class="kpi-value">${live.length}</div><div class="kpi-note">${live.filter((a) => a.stage === 'Needs Approval').length} awaiting approval · ${live.filter((a) => a.stage === 'Creating').length} in production.</div></div>
        <div class="card kpi"><div class="kpi-label">Assets still owed</div><div class="kpi-value">${assetsRemaining}</div><div class="kpi-note">Videos remaining across live deals.</div></div>
      </div>
      <div class="section-title">All rounds <span class="hint">click a row for the brief, notes, and posted links</span></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Deal</th><th>Stage</th><th class="money">Deal amount</th><th class="money">Received</th><th class="money">Outstanding</th><th>Assets</th><th>Affil.</th><th>Next payment</th></tr></thead>
        <tbody>${[...A].sort((a, b) => (a.stage === 'DEAD') - (b.stage === 'DEAD') || (b.amount || 0) - (a.amount || 0)).map(row).join('')}</tbody>
      </table></div>
      <div class="banner blue" style="margin-top:14px"><span>ℹ</span><div><b>Two systems, one view.</b> These records live in Airtable (delivery + payment tracking). The 65 audited inbound offers live in the Google Sheet (negotiation). When an inbound offer closes, it graduates here. Higgsfield appears in both — the audit has a fresh retainer approach (NV-DEAL-0047) while the old direct deal sits DEAD with filmed footage available.</div></div>`,
    mount() {
      document.querySelectorAll('[data-exp]').forEach((tr) => tr.addEventListener('click', () => {
        const exp = document.getElementById('exp-' + tr.dataset.exp);
        if (exp) exp.hidden = !exp.hidden;
      }));
    }
  };
}

/* ---------------- MANYCHAT AUDIT ---------------- */
function viewManychat(params) {
  const filter = params?.get('filter') || '';
  const CLS_COLOR = { 'New Deal': 'blue', 'Existing Deal Enriched': 'purple', 'Possible Duplicate': 'amber', 'Needs Manual Review': 'red', 'Scam or Suspicious': 'red' };
  const FILTERS = ['New Deal', 'Existing Deal Enriched', 'Possible Duplicate', 'Scam or Suspicious', 'Needs Manual Review', 'Response Ready', 'No Response Recommended'];
  return {
    title: 'ManyChat Audit',
    html: `
      <h1 class="page-title">ManyChat Audit</h1>
      <div class="page-sub">${NV.manychat.records.length} relevant commercial DM conversations from the Instagram audit. This is a source-management view, not a second pipeline — pipeline value lives only on the linked Deal IDs.</div>
      <div class="filters">
        <select id="mc-filter">
          <option value="">All classifications</option>
          ${FILTERS.map((f) => `<option ${f === filter ? 'selected' : ''}>${f}</option>`).join('')}
        </select>
        <span class="count" id="mc-count"></span>
      </div>
      <div id="mc-list"></div>
      <div class="banner blue" style="margin-top:14px"><span>ℹ</span><div>The audit's planning notes referenced a suspicious "Cognexia" solicitation, but no such record exists in the live workbook — nothing was imported for it. If it lands in the ManyChat Audit tab later, the next sync picks it up.</div></div>`,
    mount() {
      const sel = document.getElementById('mc-filter');
      const render = () => {
        const f = sel.value;
        let list = NV.manychat.records.filter((m) =>
          !f ? true :
          f === 'Response Ready' ? !!draftById(m.draftId) :
          f === 'No Response Recommended' ? !draftById(m.draftId) && !m.draftId?.startsWith('RD-MC') :
          m.classification === f);
        document.getElementById('mc-count').textContent = `${list.length} of ${NV.manychat.records.length}`;
        document.getElementById('mc-list').innerHTML = `<div class="grid cols-2">` + list.map((m) => `
          <div class="card">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
              <h3 style="margin:0">${esc(m.id)} — ${esc(m.brand)}</h3>
              <span class="chip ${CLS_COLOR[m.classification] || ''}">${esc(m.classification)}</span>
            </div>
            <div class="kv-grid" style="margin-top:10px">
              <div class="k">Instagram</div><div class="v">${m.ig ? '@' + esc(m.ig) : '(not captured)'} · ${esc(m.contact)}</div>
              <div class="k">Dates</div><div class="v">${esc(m.dates)}</div>
              <div class="k">Summary</div><div class="v">${esc(m.summary)}</div>
              <div class="k">Offer</div><div class="v">${esc(m.offer)}</div>
              ${m.rights && m.rights !== 'TBD' && m.rights !== 'N/A' ? `<div class="k">Rights</div><div class="v" style="color:var(--amber)">${esc(m.rights)}</div>` : ''}
              <div class="k">Email match</div><div class="v">${esc(m.emailMatch)}</div>
              <div class="k">Deal</div><div class="v">${m.linkedDealId ? `<a href="${dealLink(m.linkedDealId)}">${esc(m.linkedDealId)}</a>` : m.relatedDealId ? `related: <a href="${dealLink(m.relatedDealId)}">${esc(m.relatedDealId)}</a> (no own pipeline ID)` : '<span style="color:var(--text-3)">none — manual review</span>'}</div>
              <div class="k">Action</div><div class="v">${esc(m.action)}</div>
              <div class="k">Draft</div><div class="v">${draftById(m.draftId) ? `<a href="#/deal/${draftById(m.draftId).dealId}?tab=negotiation">${esc(m.draftId)}</a>` : esc(m.draftId || '—') + ' <span style="color:var(--text-3)">(sheet draft, not imported as sendable)</span>'}</div>
            </div>
            ${m.link ? `<div style="margin-top:10px"><a class="btn sm" href="${esc(m.link)}" target="_blank" rel="noopener">Open in ManyChat ↗</a></div>` : ''}
          </div>`).join('') + '</div>';
      };
      sel.addEventListener('input', render);
      render();
    }
  };
}

/* ---------------- FOLLOW-UPS ---------------- */
function viewFollowups() {
  const groups = [
    ['Within 24–48 hours', NV.followups.filter((f) => /24-48|48h/.test(f.timing))],
    ['Within 3–5 days', NV.followups.filter((f) => f.timing.includes('3-5'))],
    ['Within 1 week', NV.followups.filter((f) => f.timing.includes('1 week'))]
  ];
  const srcLink = (f) => {
    if (f.gmail && /^https?:/.test(f.gmail)) return `<a href="${esc(f.gmail)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Gmail ↗</a>`;
    const m = (f.manychatIds || []).map(mcById).find((x) => x && x.link);
    return m ? `<a href="${esc(m.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">ManyChat ↗</a>` : '<span style="color:var(--text-3)">—</span>';
  };
  return {
    title: 'Follow-Ups',
    html: `
      <h1 class="page-title">Follow-Ups</h1>
      <div class="page-sub">${NV.followups.length} queued from the audit (57 email + 8 DM), grouped by urgency. Houston and Higgsfield stay unified — their DM follow-ups live on the same deal.</div>
      ${groups.map(([label, rows]) => `
        <div class="section-title">${label} <span class="hint">${rows.length}</span></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Deal</th><th>Source</th><th>Priority</th><th>Grade</th><th>Days</th><th>Action</th><th></th></tr></thead>
          <tbody>
          ${rows.map((f) => `
            <tr data-href="${dealLink(f.dealId)}" ${rowClick}>
              <td><b>${esc(f.brand)}</b><br><span style="color:var(--text-3);font-size:11.5px">${esc(f.dealId)}</span></td>
              <td>${chBadge(f.channel)}</td>
              <td>${f.timing.includes('high priority') ? '<span class="chip green">High</span>' : `<span class="chip">${esc(f.priority)}</span>`}</td>
              <td>${gradeChip(f.grade)}</td>
              <td class="num">${f.days === '' || f.days == null ? '—' : f.days + 'd'}</td>
              <td style="font-size:12.5px;color:var(--text-2);max-width:320px">${esc(f.action)}</td>
              <td>${srcLink(f)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`).join('')}`
  };
}

/* ---------------- RESPONSES ---------------- */
function viewResponses() {
  const groups = {};
  NV.drafts.forEach((x) => { (groups[x.responseType] = groups[x.responseType] || []).push(x); });
  return {
    title: 'Responses',
    html: `
      <h1 class="page-title">Responses</h1>
      <div class="page-sub">${NV.drafts.length} prepared drafts in Aaron's voice — all on HOLD. Approve, copy into Gmail, and mark sent from each deal's negotiation tab.</div>
      ${Object.entries(groups).map(([type, list]) => `
        <div class="section-title">${esc(type)} <span class="hint">${list.length}</span></div>
        <div class="card" style="padding:6px 16px">
          ${list.map((x) => {
            const st = NVStore.getDraftStatus(x.dealId);
            return `
            <div class="list-item" onclick="location.hash='#/deal/${x.dealId}?tab=negotiation'">
              <div style="min-width:0;flex:1">
                <b style="font-size:13.5px">${esc(x.brand)}</b>
                <div style="font-size:12px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.subject)} · to ${esc(x.recipient)}</div>
              </div>
              ${chBadgeDraft(x.channel)}
              ${x.exception ? '<span class="chip purple">Exception</span>' : ''}
              ${st ? `<span class="chip ${st === 'Approved internally' ? 'green' : 'blue'}">${esc(st)}</span>` : '<span class="chip amber">Hold</span>'}
            </div>`; }).join('')}
        </div>`).join('')}`
  };
}

/* ---------------- BRANDS ---------------- */
function viewBrands() {
  return {
    title: 'Brands',
    html: `
      <h1 class="page-title">Brands</h1>
      <div class="page-sub">${NV.research.length} priority brands with deep research. Every other deal has baseline legitimacy checks on its own Research tab.</div>
      <div class="grid cols-2">
        ${NV.research.map((r) => `
          <div class="card" style="cursor:pointer" onclick="location.hash='#/deal/${r.dealId}?tab=research'">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <h3 style="margin:0">${esc(r.brand)}</h3>
              <span class="chip ${r.fit.startsWith('HIGH') ? 'green' : r.fit.startsWith('NONE') ? 'red' : 'blue'}">${esc(r.fit.split(' —')[0].split(' BUT')[0])}</span>
            </div>
            <div style="font-size:12.5px;color:var(--text-2);margin:7px 0">${esc(r.company)}</div>
            <div style="font-size:12px;color:var(--text-3)">${esc(r.domain)} · ${esc(r.reputation)}</div>
            <div style="font-size:12.5px;margin-top:8px;color:var(--text-2)"><b style="color:var(--text)">Note:</b> ${esc(r.notes)}</div>
          </div>`).join('')}
      </div>`
  };
}

/* ---------------- CONTACTS ---------------- */
function viewContacts() {
  const map = {};
  NV.deals.forEach((d) => {
    const key = d.contact_email.toLowerCase();
    if (!map[key]) map[key] = { email: d.contact_email, agency: d.agency, deals: [] };
    map[key].deals.push(d);
  });
  const contacts = Object.values(map).sort((a, b) => b.deals.reduce((s, d) => s + num(d.prob_weighted_usd), 0) - a.deals.reduce((s, d) => s + num(d.prob_weighted_usd), 0));
  return {
    title: 'Contacts',
    html: `
      <h1 class="page-title">Contacts</h1>
      <div class="page-sub">${contacts.length} counterparties across ${NV.deals.length} deals, ordered by pipeline value.</div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Contact</th><th>Agency</th><th>Deals</th><th class="money">Weighted value</th><th>Flags</th></tr></thead>
        <tbody>
          ${contacts.map((c) => {
            const val = c.deals.reduce((s, d) => s + (d.prob_weighted_usd || 0), 0);
            const worst = c.deals.some((d) => d.scam_risk === 'High') ? 'High' : c.deals.some((d) => d.scam_risk === 'Medium') ? 'Medium' : null;
            return `
            <tr data-href="${dealLink(c.deals[0].deal_id)}" ${rowClick}>
              <td><b>${esc(c.email)}</b></td>
              <td style="color:var(--text-2);font-size:12.5px">${esc(c.agency) || '—'}</td>
              <td>${c.deals.map((d) => `<a href="${dealLink(d.deal_id)}" onclick="event.stopPropagation()">${esc(d.brand.split(' (')[0])}</a>`).join(', ')}</td>
              <td class="money">${fmt$(val)}</td>
              <td>${worst ? scamChip(worst) : ''}</td>
            </tr>`; }).join('')}
        </tbody>
      </table></div>`
  };
}

/* ---------------- FILES ---------------- */
function viewFiles() {
  return {
    title: 'Contracts & Files',
    html: `
      <h1 class="page-title">Contracts & Files</h1>
      <div class="page-sub">Deal documents live in Google Drive; this area holds the references and Claude's extracted terms.</div>
      <div class="card">
        <h3>Nothing attached yet</h3>
        <div style="font-size:13.5px;color:var(--text-2);line-height:1.6">
          None of the 65 audited threads included a signed contract. As briefs, SOWs and contracts arrive:
          drop them in Drive, tell Claude in Cowork which deal they belong to, and each deal's Files tab will show the
          file name, type, Drive link, last-modified date, analysis status and the extracted terms — with a side-by-side
          comparison against the CRM's working understanding and every material difference flagged.
          Files stay in Drive; only references and extracted terms are stored here.
        </div>
      </div>
      <div class="card">
        <h3>Watch list — deals most likely to produce paper first</h3>
        ${['NV-DEAL-0028', 'NV-DEAL-0057', 'NV-DEAL-0016', 'NV-DEAL-0019', 'NV-DEAL-0047'].map((id) => {
          const d = dealById(id);
          return `<div class="list-item" onclick="location.hash='${dealLink(id)}?tab=terms'">
            <b style="font-size:13px">${esc(d.brand)}</b>
            <span style="font-size:12.5px;color:var(--text-2)">${esc(d.rights_flags !== 'None detected' ? 'Rights on the table: ' + d.rights_flags : d.recommended_action)}</span>
          </div>`; }).join('')}
      </div>`
  };
}

/* ---------------- ANALYTICS ---------------- */
function viewAnalytics() {
  const viable = NV.deals.filter(isViable);
  const byCat = {};
  viable.forEach((d) => { byCat[d.ai_category] = (byCat[d.ai_category] || 0) + num(d.prob_weighted_usd); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const byStruct = Object.entries(NV.dashboard.structureCounts);
  const top = [...viable].sort((a, b) => num(b.prob_weighted_usd) - num(a.prob_weighted_usd)).slice(0, 10);
  const grades = Object.entries(NV.dashboard.pipelineSummary.gradeDistribution);
  return {
    title: 'Analytics',
    html: `
      <h1 class="page-title">Analytics</h1>
      <div class="page-sub">All values probability-weighted unless labeled otherwise. Estimates stay estimates.</div>
      <div class="grid cols-2">
        <div class="card"><h3>Weighted pipeline by category ${estChip()}</h3>
          ${cats.map(([k, v]) => barRow(k, Math.round(v), cats[0][1], fmt$)).join('')}</div>
        <div class="card"><h3>Top 10 deals by weighted value ${estChip()}</h3>
          ${top.map((d) => barRow(d.brand.split(' (')[0], d.prob_weighted_usd, top[0].prob_weighted_usd, fmt$)).join('')}</div>
        <div class="card"><h3>Deals by commercial structure</h3>
          ${byStruct.map(([k, v]) => barRow(k, v, 35)).join('')}</div>
        <div class="card"><h3>Grade distribution</h3>
          ${grades.map(([k, v]) => barRow('Grade ' + k, v, 29)).join('')}
          <div style="font-size:12px;color:var(--text-3);margin-top:10px">5 B-grade deals carry the pipeline: Kimi ×2, Ryze, Houston, Cola.</div></div>
      </div>`
  };
}

/* ---------------- RATE CARD ---------------- */
function viewRatecard() {
  const rc = NV.ratecard;
  const tbl = (rows) => `
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Format</th><th class="money">Low</th><th class="money">Base</th><th class="money">Premium</th><th>Notes</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr style="cursor:default"><td><b>${esc(r.format)}</b></td>
        <td class="money">${fmt$(r.low)}</td><td class="money"><b>${fmt$(r.base)}</b></td><td class="money">${fmt$(r.premium)}</td>
        <td style="font-size:12px;color:var(--text-3)">${esc(r.notes)}</td></tr>`).join('')}
      </tbody></table></div>`;
  return {
    title: 'Rate Card',
    html: `
      <h1 class="page-title">Rate Card</h1>
      <div class="page-sub">Basis: 104K IG followers, ~12.4K median Reel views, B2B AI-marketing niche premium. Editable estimates in USD.</div>
      <div class="banner blue"><span>▦</span><div><b>Floor policy (v3.0):</b> $1,000 minimum internal value per post · three-post minimum · $3,000 minimum organic package. Everything below is a component price — packages never quote under the floor.</div></div>
      <div class="section-title">Deliverables</div>
      ${tbl(rc.deliverables)}
      <div class="section-title">Usage & rights <span class="hint">applied on top of content fees — never bundled</span></div>
      ${tbl(rc.rights)}
      <div class="banner red" style="margin-top:14px"><span>✕</span><div><b>AI identity rights:</b> ${esc(rc.aiIdentityRights)}</div></div>
      <div class="card" style="margin-top:14px">
        <h3>Scoring methodology (100-point, QA-verified)</h3>
        ${rc.scoring.components.map((c) => barRow(c.name, c.points, 20)).join('')}
        <div style="font-size:12px;color:var(--text-3);margin-top:8px">${esc(rc.scoring.note)}</div>
      </div>`
  };
}

/* ---------------- DATA HEALTH ---------------- */
function viewHealth() {
  const m = NV.meta;
  const opsCount = NVStore.opsCount();
  return {
    title: 'Data Health',
    html: `
      <h1 class="page-title">Data Health</h1>
      <div class="page-sub">Source of truth: the audited Google Sheet. Operational layer: this browser (export it regularly).</div>
      <div class="grid cols-4">
        <div class="card kpi"><div class="kpi-label">Deals imported</div><div class="kpi-value">${m.dealCount}</div><div class="kpi-note">All unique NV-DEAL ids, imported once. Validation: ${m.validation}.</div></div>
        <div class="card kpi"><div class="kpi-label">Drafts</div><div class="kpi-value">${m.draftCount}</div><div class="kpi-note">57 viable + 5 declines. 3 do-not-engage deals have none.</div></div>
        <div class="card kpi"><div class="kpi-label">Follow-ups</div><div class="kpi-value">${m.followupCount}</div><div class="kpi-note">Queued in sheet order.</div></div>
        <div class="card kpi"><div class="kpi-label">Your changes logged</div><div class="kpi-value">${opsCount}</div><div class="kpi-note">Operational events in this browser's activity history.</div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h3>Channel & ManyChat integrity</h3>
        <div class="kv-grid">
          <div class="k">Source breakdown</div><div class="v">${NV.meta.channels.email} email-only · ${NV.meta.channels.manychat} ManyChat-only · ${NV.meta.channels.both} email + ManyChat</div>
          <div class="k">ManyChat audit rows</div><div class="v">${NV.meta.manychatCount} (synced ${esc(NV.meta.manychatSyncedAt)})</div>
          <div class="k">Linked to deals</div><div class="v">${NV.manychat.records.filter((m) => m.linkedDealId).length} linked · ${NV.manychat.records.filter((m) => !m.linkedDealId).length} unlinked (held for manual review — Riya + 2 Dreamina intermediaries)</div>
          <div class="k">Possible duplicates</div><div class="v">${NV.manychat.records.filter((m) => m.classification === 'Possible Duplicate').length} — excluded from pipeline value</div>
          <div class="k">Channel conflicts</div><div class="v">${NV.manychat.records.filter((m) => m.channelConflict).length} — Higgsfield direct-brand vs agency route</div>
          <div class="k">Missing ManyChat URLs</div><div class="v">${NV.manychat.records.filter((m) => !m.link).length} (preview-only conversations)</div>
          <div class="k">Missing email threads</div><div class="v">${NV.deals.filter((d) => d.source_channel === 'manychat').length} DM-only deals (expected — no email yet)</div>
          <div class="k">Max deal ID</div><div class="v">NV-DEAL-00${Math.max(...NV.deals.map((d) => +d.deal_id.slice(-4)))} · ${NV.deals.length} unique rows</div>
          <div class="k">Backup tabs</div><div class="v"><span class="chip green">Ignored — only active tabs consumed</span></div>
          <div class="k">Parse warnings</div><div class="v">${NV.meta.warnings?.length ? NV.meta.warnings.map(esc).join('<br>') : '<span class="chip green">None</span>'}</div>
        </div>
      </div>
      <div class="card">
        <h3>Source 2 — Airtable (live deals)</h3>
        <div class="kv-grid">
          <div class="k">Table</div><div class="v">Content System → Brand Deals (${NV.active.deals.length} records, ${NV.active.deals.filter((a) => a.stage !== 'DEAD').length} live)</div>
          <div class="k">Synced</div><div class="v">${esc(NV.active.syncedAt)} via Airtable connector</div>
          <div class="k">Refresh</div><div class="v">Tell Claude in Cowork to "re-sync Airtable deals" — new DM deals you're entering will flow in on the next sync.</div>
        </div>
      </div>
      <div class="card">
        <h3>Source 1 — Google Sheet (audited inbound)</h3>
        <div class="kv-grid">
          <div class="k">Google Sheet</div><div class="v"><a href="${esc(m.sourceSheet)}" target="_blank" rel="noopener">Open source workbook ↗</a></div>
          <div class="k">Record version</div><div class="v">${esc(m.recordVersion)} (QA pass + pricing revaluation complete)</div>
          <div class="k">Sheet last updated</div><div class="v">${esc(m.sourceSyncedAt)}</div>
          <div class="k">Data bundle built</div><div class="v">${new Date(m.builtAt).toLocaleString()}</div>
          <div class="k">Validation</div><div class="v"><span class="chip green">65 unique IDs · probabilities ≤ 1 · weighted math verified · 0 duplicates</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Sync now</h3>
        <div style="font-size:13.5px;color:var(--text-2);line-height:1.6">
          Re-pull the sheet and rebuild the data bundle from the repo:
          <pre style="background:var(--surface-2);border:1px solid var(--border);border-radius:9px;padding:10px 13px;font-family:var(--mono);font-size:12px;overflow:auto">node scripts/sync.mjs   # fetches all tabs from the Google Sheet
node scripts/build-data.mjs   # validates + rebuilds data/nv-data.js</pre>
          Then commit and push — Cloudflare Pages redeploys automatically. Failed rows abort the build loudly; nothing is silently dropped. You can also just tell Claude in Cowork to "sync the deal sheet" and it will run this and push.
        </div>
      </div>
      <div class="card">
        <h3>Two data layers, kept separate</h3>
        <div class="kv-grid">
          <div class="k">Source (read-only)</div><div class="v">The audit: outreach, contacts, values, research, scoring, rights analysis, prepared drafts. Rebuilt only by sync; never edited in the app.</div>
          <div class="k">Operational (yours)</div><div class="v">Stages, notes, approvals, brand replies, voice feedback — stored in this browser with full before/after history. Export from Settings to back up or commit.</div>
        </div>
      </div>`
  };
}

/* ---------------- SETTINGS ---------------- */
function viewSettings() {
  const vp = NVStore.getVoiceProfile();
  const lib = NVStore.getVoiceLibrary();
  return {
    title: 'Settings',
    html: `
      <h1 class="page-title">Settings</h1>
      <div class="page-sub">Aaron's voice profile, the voice library, and operational data controls.</div>

      <div class="section-title">Aaron Voice Profile <span class="hint">Claude writes every draft from this + your approved examples</span></div>
      <div class="card">
        ${[['identity', 'Identity'], ['traits', 'Voice traits'], ['sentences', 'Sentence style'], ['greeting', 'Preferred greeting'], ['signoff', 'Sign-off'], ['pricing', 'How pricing is discussed'], ['preferred', 'Preferred phrases (| separated)'], ['banned', 'Banned phrases (; separated)']].map(([k, lbl]) => `
          <div class="field"><label>${lbl}</label><textarea data-vp="${k}" style="min-height:${k === 'identity' || k === 'greeting' || k === 'signoff' ? 48 : 76}px">${esc(vp[k])}</textarea></div>`).join('')}
        <div style="display:flex;gap:8px">
          <button class="btn primary" id="save-vp">Save profile</button>
          <button class="btn" id="reset-vp">Reset to defaults</button>
        </div>
      </div>

      <div class="section-title">Voice Library <span class="hint">only messages you explicitly mark are learned from</span></div>
      <div class="card">
        ${lib.length ? lib.map((v) => {
          const dr = draftById(v.draftId);
          return `<div class="list-item" onclick="location.hash='#/deal/${v.dealId}?tab=negotiation'">
            <span class="chip green">${esc(v.mark)}</span>
            <div style="min-width:0"><b style="font-size:13px">${esc(dr ? dr.brand : v.dealId)}</b>
            <div style="font-size:12px;color:var(--text-3)">${esc(v.draftId)} · marked ${timeAgo(v.ts)}</div></div>
          </div>`; }).join('') : '<div class="empty">No approved voice examples yet. On any draft, use "Voice feedback → Approved Voice Example" and it lands here. Claude prioritizes these real examples over the written profile.</div>'}
      </div>

      <div class="section-title">Operational data</div>
      <div class="card">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="export-ops">Export operational data (JSON)</button>
          <label class="btn" style="cursor:pointer">Import<input type="file" id="import-ops" accept=".json" hidden></label>
          <button class="btn danger" id="reset-ops">Reset operational data</button>
        </div>
        <div style="font-size:12.5px;color:var(--text-3);margin-top:10px">Stages, notes, approvals, activity and voice marks live in this browser. Export regularly (or paste the export to Claude to commit into the repo as <span style="font-family:var(--mono)">data/operational.json</span>). Importing replaces the current operational layer. Source audit data is unaffected either way.</div>
      </div>`,
    mount() {
      document.getElementById('save-vp').addEventListener('click', () => {
        const p = { ...NVStore.getVoiceProfile() };
        document.querySelectorAll('[data-vp]').forEach((ta) => { p[ta.dataset.vp] = ta.value; });
        NVStore.setVoiceProfile(p); toast('Voice profile saved');
      });
      document.getElementById('reset-vp').addEventListener('click', () => { NVStore.resetVoiceProfile(); toast('Profile reset'); renderRoute(); });
      document.getElementById('export-ops').addEventListener('click', () => {
        const blob = new Blob([NVStore.exportJSON()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `nv-crm-operational-${new Date().toISOString().slice(0, 10)}.json`;
        a.click(); URL.revokeObjectURL(a.href);
        toast('Exported');
      });
      document.getElementById('import-ops').addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (!f) return;
        f.text().then((t) => { try { NVStore.importJSON(t); toast('Imported'); renderRoute(); } catch (err) { toast('Import failed: ' + err.message); } });
      });
      document.getElementById('reset-ops').addEventListener('click', () => {
        if (confirm('Reset all stages, notes, approvals and activity? The audit data is untouched.')) { NVStore.resetAll(); toast('Operational data reset'); renderRoute(); }
      });
    }
  };
}

window.NVViews = { viewHome, viewDeals, viewPipeline, viewDealDetail, viewNegotiations, viewFollowups, viewResponses, viewBrands, viewContacts, viewFiles, viewAnalytics, viewRatecard, viewHealth, viewSettings, viewActive, viewManychat };
