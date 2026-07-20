/* store.js — operational CRM layer.
 * Source data (window.NV_DATA) is the imported audit and is never mutated.
 * Everything Aaron does lives here, in localStorage, with full activity history,
 * and can be exported/imported as JSON to commit back to the repo. */

const NVStore = (() => {
  const KEY = 'nv-crm-ops-v2';

  const DEFAULT_VOICE_PROFILE = {
    identity: "Aaron — manager of Noe Varner's brand partnerships.",
    traits: "Direct. Human. Confident. Commercially aware. Conversational. Clear. Firm when necessary. Friendly without sounding overly excited. Comfortable discussing money. Protective of Noe's value. Never corporate, apologetic, verbose, robotic, or desperate for the deal.",
    sentences: "Short or medium sentences. Plain English. Direct questions. Clear numbers. Clean package descriptions. Minimal filler. Never repeat the brand's entire email back to them.",
    greeting: "Hi {name} — Aaron here. I manage Noe Varner's brand partnerships.",
    signoff: "Best,\nAaron\nTalent Manager for Noe Varner",
    banned: "I hope this email finds you well; We are absolutely thrilled; This incredible opportunity; We would be honored; This aligns seamlessly; Unlock synergies; Elevate the partnership; Delve into; Thank you so much for this amazing opportunity; Please do not hesitate to reach out; At your earliest convenience; Warmest regards; We are incredibly excited to collaborate",
    preferred: "Thanks for reaching out. | This could be a good fit. | Before we lock anything in, I need to clarify the scope. | Can you confirm the campaign budget? | Paid usage would be quoted separately. | That rate would not cover the requested licensing. | Noe's partnerships generally begin with a three-content package. | The base investment begins at $3,000. | If the budget is fixed, we can reduce the deliverables or rights. | We would need to narrow that exclusivity language. | We do not grant perpetual usage under a standard sponsorship fee. | Let me know where the budget lands and we can structure this properly.",
    pricing: "Anchor above the floor: $1,000/post internal minimum, three-post minimum, $3,000 minimum organic package. Rights, licensing, whitelisting, exclusivity always priced separately. NEVER state a dollar amount to a brand unless they put a number on the table first; qualify budget and scope instead, and point to noevarner.com/partners for the media kit. AI likeness/voice/training rights: separate legal + commercial negotiation, 3-10x baseline, usually declined.",
    hardRules: "No dashes of any kind in outreach (no em dashes, no hyphenated asides). Every reply must respond to what the brand actually said, not read like a template. Always establish that Aaron manages Noe's partnerships."
  };

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* corrupted or unavailable */ }
    // Seed from the repo-committed baseline (data/nv-ops.js) if present.
    if (window.NV_OPS && typeof window.NV_OPS.deals === 'object') {
      try { return JSON.parse(JSON.stringify(window.NV_OPS)); } catch (e) { /* fall through */ }
    }
    return { deals: {}, voiceProfile: { ...DEFAULT_VOICE_PROFILE }, voiceLibrary: [], theme: null, sidebar: false, createdAt: new Date().toISOString() };
  }
  function save() {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  function deal(id) {
    if (!state.deals[id]) state.deals[id] = { stage: null, draftStatus: null, notes: [], activity: [], voiceMarks: {} };
    return state.deals[id];
  }

  function logActivity(id, entry) {
    const d = deal(id);
    d.activity.unshift({ ts: new Date().toISOString(), source: 'Entered by Aaron', ...entry });
    save();
  }

  return {
    get: () => state,

    // ----- stage -----
    getStage(id) { return state.deals[id]?.stage || null; },
    setStage(id, stage, reason) {
      const d = deal(id);
      const prev = d.stage;
      if (prev === stage) return;
      d.stage = stage;
      logActivity(id, { type: 'stage', title: `Stage changed to “${stage}”`, prev: prev || '(imported default)', next: stage, reason: reason || '' });
    },

    // ----- draft workflow (approval-gated; there is intentionally no send) -----
    getDraftStatus(id) { return state.deals[id]?.draftStatus || null; },
    setDraftStatus(id, status) {
      const d = deal(id);
      const prev = d.draftStatus;
      d.draftStatus = status;
      logActivity(id, { type: 'draft', title: `Draft marked: ${status}`, prev: prev || 'Prepared (hold)', next: status });
    },

    // ----- notes -----
    addNote(id, text) {
      const d = deal(id);
      d.notes.unshift({ ts: new Date().toISOString(), text });
      logActivity(id, { type: 'note', title: 'Note added', detail: text.length > 120 ? text.slice(0, 120) + '…' : text });
    },
    getNotes(id) { return state.deals[id]?.notes || []; },

    // ----- activity -----
    getActivity(id) { return state.deals[id]?.activity || []; },

    // ----- voice learning (controlled; only explicit marks are learned from) -----
    markVoice(id, draftId, mark) {
      const d = deal(id);
      d.voiceMarks[draftId] = mark;
      if (mark === 'Approved Voice Example' || mark === 'Strong Example') {
        if (!state.voiceLibrary.find((v) => v.draftId === draftId)) {
          state.voiceLibrary.push({ draftId, dealId: id, mark, ts: new Date().toISOString() });
        }
      } else {
        state.voiceLibrary = state.voiceLibrary.filter((v) => v.draftId !== draftId);
      }
      logActivity(id, { type: 'voice', title: `Voice feedback: ${mark}`, detail: draftId });
    },
    getVoiceMark(id, draftId) { return state.deals[id]?.voiceMarks?.[draftId] || null; },
    getVoiceLibrary() { return state.voiceLibrary; },

    // ----- voice profile -----
    getVoiceProfile() { return state.voiceProfile; },
    setVoiceProfile(p) { state.voiceProfile = p; save(); },
    resetVoiceProfile() { state.voiceProfile = { ...DEFAULT_VOICE_PROFILE }; save(); },

    // ----- prefs -----
    getTheme() { return state.theme; },
    setTheme(t) { state.theme = t; save(); },
    getSidebar() { return state.sidebar; },
    setSidebar(v) { state.sidebar = v; save(); },

    // ----- export / import -----
    exportJSON() { return JSON.stringify(state, null, 2); },
    importJSON(json) {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed.deals !== 'object') throw new Error('Not a valid operational export');
      state = parsed; save();
    },
    resetAll() { state = { deals: {}, voiceProfile: { ...DEFAULT_VOICE_PROFILE }, voiceLibrary: [], theme: state.theme, sidebar: state.sidebar, createdAt: new Date().toISOString() }; save(); },
    opsCount() {
      let n = 0;
      for (const id in state.deals) { const d = state.deals[id]; n += (d.activity?.length || 0); }
      return n;
    }
  };
})();
