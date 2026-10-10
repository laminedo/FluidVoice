// Runs on every web page (and inside its frames). Finds the text box you're typing in, listens while you talk,
// shows what it hears in a small bubble, and types the cleaned-up text where your cursor is.
(() => {
  "use strict";
  if (globalThis.__fluidvoiceContent) return;
  globalThis.__fluidvoiceContent = true;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const IS_TOP = window === window.top;
  const MSG = "__fluidvoice"; // key used in postMessage between this page's frames
  const DEFAULTS = globalThis.FLUIDVOICE_DEFAULTS;
  const Format = globalThis.FluidVoiceFormat;
  let settings = Object.assign({}, DEFAULTS);
  let shortcut = "Alt+Shift+D";
  const state = { mode: "idle", session: 0, rec: null, target: null, saved: null, finalRaw: "", interim: "", heard: false,
    stopRequested: false, cancelled: false, restarts: 0, error: null, stopTimer: 0, watchdog: 0 };

  /* ---------------- Settings ---------------- */
  function applySettings(values) {
    settings = Object.assign({}, DEFAULTS, values);
    Format.configure(settings, settings.dictionary);
    if (!settings.showButton && state.mode === "idle") hideButton();
  }
  try {
    chrome.storage.local.get(DEFAULTS, applySettings);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const next = Object.assign({}, settings);
      for (const k of Object.keys(changes)) next[k] = changes[k].newValue;
      applySettings(next);
    });
    chrome.runtime.sendMessage({ type: "fluidvoice:get-shortcut" }).then(s => { if (s) shortcut = s; }).catch(() => {});
  } catch { /* extension was reloaded; this old copy of the script just stays quiet */ }

  /* ---------------- Text boxes ---------------- */
  const TEXT_INPUT_TYPES = /^(|text|search|email|url|tel)$/; // never password fields
  const isField = el => el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT");
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === "TEXTAREA") return !el.readOnly && !el.disabled;
    if (el.tagName === "INPUT") return TEXT_INPUT_TYPES.test((el.getAttribute("type") || "").toLowerCase()) && !el.readOnly && !el.disabled;
    return el.isContentEditable;
  }
  function deepActive() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }
  // The element that owns the editing for a contenteditable area.
  function editingHost(el) {
    if (isField(el)) return el;
    let host = el;
    while (host.parentElement && host.parentElement.isContentEditable) host = host.parentElement;
    return host;
  }
  function selectionFor(el) {
    const root = el.getRootNode();
    return (root && root.getSelection && root.getSelection()) || window.getSelection();
  }
  function saveSelection(el) {
    if (isField(el)) return { start: el.selectionStart, end: el.selectionEnd };
    const sel = selectionFor(el);
    if (sel && sel.rangeCount && el.contains(sel.getRangeAt(0).startContainer)) return { range: sel.getRangeAt(0).cloneRange() };
    return null;
  }
  function restoreSelection(el, saved) {
    el.focus({ preventScroll: true });
    if (!saved) return;
    if (isField(el) && saved.start != null) { try { el.setSelectionRange(saved.start, saved.end); } catch { /* some input types don't allow it */ } }
    else if (saved.range) { const sel = selectionFor(el); sel.removeAllRanges(); sel.addRange(saved.range); }
  }
  const BLOCK = /^(block|list-item|table-cell|flex|grid)$/;
  // The text just before the cursor, within the same line or paragraph.
  function textBeforeCaret(el) {
    if (isField(el)) return (el.value || "").slice(0, el.selectionStart || 0).split("\n").pop();
    const sel = selectionFor(el);
    if (!sel || !sel.rangeCount) return "";
    const caret = sel.getRangeAt(0);
    let block = caret.startContainer.nodeType === 1 ? caret.startContainer : caret.startContainer.parentElement;
    while (block && block !== el && !BLOCK.test(getComputedStyle(block).display)) block = block.parentElement;
    const r = document.createRange();
    r.selectNodeContents(block || el);
    try { r.setEnd(caret.startContainer, caret.startOffset); } catch { return ""; }
    return r.toString().slice(-300);
  }

  function insertDictation(el, raw, saved) {
    if (!el || !el.isConnected) return false;
    // Keep the cursor where it is if the person is still in the box; otherwise put it back where dictation started.
    if (deepActive() !== el) restoreSelection(el, saved);
    const before = textBeforeCaret(el);
    const atStart = !before.trim() || /[.!?…]["”')\]]*\s*$/.test(before);
    let text = Format.format(raw, atStart);
    if (!text) return true;
    if (before && !/\s$/.test(before) && !/^[\s,.;:!?…)\]}”%]/.test(text)) text = " " + text;
    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch { ok = false; }
    if (!ok && isField(el)) {
      const s = el.selectionStart, e = el.selectionEnd;
      el.setRangeText(text, s, e, "end");
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      ok = true;
    }
    return ok ? text : false;
  }

  /* ---------------- On-page interface (inside a closed shadow root, so pages can't restyle it) ---------------- */
  let ui = null;
  function getUI() {
    if (ui) return ui;
    const host = document.createElement("fluidvoice-ui");
    host.style.cssText = "all: initial; position: fixed; inset: 0 auto auto 0; width: 0; height: 0; z-index: 2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .mic {
          position: fixed; width: 28px; height: 28px; border: 0; border-radius: 50%; padding: 0; margin: 0;
          display: grid; place-items: center; cursor: pointer;
          background: #3AC8C6; color: #032B2A;
          box-shadow: 0 1px 3px rgba(0,0,0,.25), 0 0 0 3px rgba(58,200,198,.25);
          transition: transform .15s ease, background-color .15s ease, opacity .15s ease; opacity: .92;
        }
        .mic:hover { transform: scale(1.08); opacity: 1; }
        .mic:focus-visible { outline: 3px solid #0A6E6C; outline-offset: 2px; }
        .mic[data-live="true"] { background: #FF3B30; color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25), 0 0 0 4px rgba(255,59,48,.25); opacity: 1; }
        .mic svg { width: 15px; height: 15px; }
        .pill {
          position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%);
          display: flex; align-items: center; gap: 12px; max-width: min(680px, calc(100vw - 32px)); min-width: 260px;
          padding: 9px 9px 9px 16px; border-radius: 999px;
          background: rgba(28, 28, 30, .94); color: #F5F5F7;
          -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
          box-shadow: 0 12px 32px rgba(0,0,0,.35), inset 0 0 0 .5px rgba(255,255,255,.14);
          font: 500 14px/1.35 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif; letter-spacing: -.01em;
          animation: rise .22s cubic-bezier(.3,.7,.4,1);
        }
        @keyframes rise { from { opacity: 0; transform: translate(-50%, 10px); } }
        .bars { display: flex; align-items: center; gap: 3px; height: 18px; flex: none; }
        .bars i { width: 3px; height: 6px; border-radius: 2px; background: #FF453A; animation: bar 1s ease-in-out infinite; }
        .bars i:nth-child(2) { animation-delay: .15s } .bars i:nth-child(3) { animation-delay: .3s } .bars i:nth-child(4) { animation-delay: .45s }
        .pill[data-kind="waiting"] .bars i { background: #98989D; animation-duration: 1.6s; }
        .pill[data-kind="info"] .bars, .pill[data-kind="error"] .bars, .pill[data-kind="done"] .bars { display: none; }
        @keyframes bar { 50% { height: 18px; } }
        .icon { flex: none; width: 18px; height: 18px; display: none; }
        .pill[data-kind="error"] .icon.alert, .pill[data-kind="info"] .icon.alert, .pill[data-kind="done"] .icon.check { display: block; }
        .pill[data-kind="error"] .icon { color: #FFB340; } .pill[data-kind="info"] .icon { color: #98989D; } .pill[data-kind="done"] .icon { color: #30D158; }
        .body { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1px; }
        .text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .text .interim { color: rgba(245,245,247,.62); }
        .hint { font-size: 11.5px; font-weight: 400; color: rgba(245,245,247,.62); letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pill[data-kind="error"] .text, .pill[data-kind="info"] .text { white-space: normal; }
        .actions { display: flex; gap: 6px; flex: none; }
        .act {
          height: 32px; min-width: 32px; padding: 0 12px; border: 0; border-radius: 999px; cursor: pointer;
          font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          background: rgba(255,255,255,.12); color: #F5F5F7; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        }
        .act:hover { background: rgba(255,255,255,.2); }
        .act:focus-visible { outline: 2px solid #3AC8C6; outline-offset: 2px; }
        .act.primary { background: #F5F5F7; color: #1D1D1F; }
        .act.primary:hover { background: #fff; }
        .act svg { width: 14px; height: 14px; }
        .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        [hidden] { display: none !important; }
        @media (prefers-reduced-motion: reduce) { .bars i, .pill { animation: none; } .mic { transition: none; } }
      </style>
      <button class="mic" type="button" hidden aria-label="Start dictation" title="Dictate (${shortcut})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>
      </button>
      <div class="pill" hidden role="dialog" aria-label="FluidVoice dictation">
        <span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <svg class="icon alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2h.01"/></svg>
        <svg class="icon check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>
        <div class="body"><div class="text"></div><div class="hint"></div></div>
        <div class="actions">
          <button class="act copy" type="button" hidden>Copy</button>
          <button class="act cancel" type="button" aria-label="Cancel dictation" title="Cancel (Esc)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button>
          <button class="act primary done" type="button">Done</button>
        </div>
        <span class="sr" aria-live="polite"></span>
      </div>`;
    (document.body || document.documentElement).appendChild(host);
    const $ = s => shadow.querySelector(s);
    ui = { host, shadow, mic: $(".mic"), pill: $(".pill"), text: $(".text"), hint: $(".hint"), copy: $(".copy"), cancel: $(".cancel"), done: $(".done"), sr: $(".sr"), copyText: "" };
    // Keep focus in the text box: buttons act on mousedown/click without stealing focus.
    for (const b of [ui.mic, ui.copy, ui.cancel, ui.done]) b.addEventListener("mousedown", e => e.preventDefault());
    ui.mic.addEventListener("click", () => {
      if (state.mode !== "idle") stop();
      else if (buttonTarget) start(buttonTarget);
    });
    ui.done.addEventListener("click", () => pillAction("stop"));
    ui.cancel.addEventListener("click", () => pillAction("cancel"));
    ui.copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(ui.copyText); showPill({ kind: "done", text: "Copied. Paste it with ⌘V or Ctrl+V.", autoHide: 3000 }); }
      catch { showPill({ kind: "error", text: "Couldn’t copy. Select the text in a text box and try again.", autoHide: 5000 }); }
    });
    return ui;
  }

  /* ---------------- The bubble at the bottom of the page (always drawn by the top frame) ---------------- */
  let pillOwner = null, pillTimer = 0;
  // kind: listening | waiting | info | error | done
  function showPill(p) {
    if (!IS_TOP) { try { window.top.postMessage({ [MSG]: "pill", p }, "*"); } catch { /* top frame unreachable */ } return; }
    renderPill(p, null);
  }
  function hidePill() { showPill({ hide: true }); }
  function renderPill(p, owner) {
    const u = getUI();
    clearTimeout(pillTimer);
    if (p.hide) { u.pill.hidden = true; return; }
    pillOwner = owner;
    u.pill.dataset.kind = p.kind;
    u.text.replaceChildren();
    const finalText = String(p.text || "");
    const interim = String(p.interim || "");
    // Show the end of long dictations: that's the part being spoken.
    const joined = (finalText + (interim ? " " + interim : "")).trim();
    const tail = joined.length > 90 ? "…" + joined.slice(-89) : joined;
    const cut = Math.max(0, tail.length - interim.length);
    u.text.append(document.createTextNode(interim ? tail.slice(0, cut) : tail));
    if (interim) { const s = document.createElement("span"); s.className = "interim"; s.textContent = tail.slice(cut); u.text.append(s); }
    const live = p.kind === "listening" || p.kind === "waiting";
    u.hint.textContent = live ? `${p.shortcut || shortcut} or Done to type it · Esc to cancel` : (p.hint || "");
    u.hint.hidden = !u.hint.textContent;
    u.done.hidden = !live; u.cancel.hidden = !live;
    u.copy.hidden = !p.copy; u.copyText = p.copy || "";
    if (p.announce) u.sr.textContent = p.announce;
    u.pill.hidden = false;
    if (p.autoHide) pillTimer = setTimeout(() => { u.pill.hidden = true; }, p.autoHide);
  }
  function pillAction(action) {
    if (pillOwner) { try { pillOwner.postMessage({ [MSG]: "control", action }, "*"); } catch { /* frame is gone */ } return; }
    if (action === "stop") stop(); else cancel();
  }
  window.addEventListener("message", e => {
    const d = e.data;
    if (!d || typeof d !== "object" || !(MSG in d)) return;
    if (d[MSG] === "pill" && IS_TOP && d.p && typeof d.p === "object") renderPill(d.p, e.source);
    else if (d[MSG] === "control" && e.source === window.top) { if (d.action === "stop") stop(); else if (d.action === "cancel") cancel(); }
  });

  /* ---------------- The small mic button next to the text box ---------------- */
  let buttonTarget = null, rafPending = false;
  function placeButton() {
    rafPending = false;
    const u = ui;
    if (!u || !buttonTarget) return;
    const r = buttonTarget.getBoundingClientRect();
    const tooSmall = r.width < 80 || r.height < 18;
    const offscreen = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
    if (tooSmall || offscreen) { u.mic.hidden = true; return; }
    const tall = r.height > 64;
    const top = tall ? r.bottom - 34 : r.top + (r.height - 28) / 2;
    // Short one-line boxes: sit just outside the right edge when there's room, so the button doesn't cover the text.
    const outside = r.height < 30 && r.right + 34 < innerWidth;
    u.mic.style.left = (outside ? r.right + 6 : Math.min(innerWidth - 32, Math.max(4, r.right - 34))) + "px";
    u.mic.style.top = Math.min(innerHeight - 32, Math.max(4, top)) + "px";
    u.mic.hidden = false;
  }
  const schedulePlace = () => { if (!rafPending && buttonTarget) { rafPending = true; requestAnimationFrame(placeButton); } };
  function showButtonFor(el) {
    if (!SR || !settings.showButton) return;
    if (state.mode !== "idle" && el !== state.target) return; // while listening, the button stays with the box being dictated into
    buttonTarget = el;
    getUI();
    placeButton();
  }
  function hideButton() { if (ui && state.mode === "idle") ui.mic.hidden = true; if (state.mode === "idle") buttonTarget = null; }
  document.addEventListener("focusin", () => {
    const a = deepActive();
    if (isEditable(a)) showButtonFor(editingHost(a));
  }, true);
  document.addEventListener("focusout", () => {
    setTimeout(() => { const a = deepActive(); if (!isEditable(a)) hideButton(); else showButtonFor(editingHost(a)); }, 120);
  }, true);
  addEventListener("scroll", schedulePlace, true);
  addEventListener("resize", schedulePlace);

  /* ---------------- Dictation ---------------- */
  const ERRORS = {
    "not-allowed": "The microphone is blocked on this site. Click the microphone icon in the address bar, choose Allow, then try again.",
    "service-not-allowed": "This page isn’t allowed to use speech recognition. Try another site, or use the FluidVoice web app.",
    "audio-capture": "No microphone found. Connect one, or check that another app isn’t using it.",
    "network": "Can’t reach Chrome’s speech service. Check your internet connection. Brave and Opera don’t include one.",
    "language-not-supported": "This language isn’t supported. Pick another one in the FluidVoice menu.",
    "no-start": "Dictation didn’t start. Allow the microphone for this site, then try again."
  };

  function render() {
    if (state.mode === "idle") return;
    showPill({
      kind: state.heard ? "listening" : "waiting",
      // Show the finished part as it will be typed; the words still being recognized stay raw and gray.
      text: Format.format(state.finalRaw) || (state.interim ? "" : state.heard ? "Listening…" : "Waiting for the microphone…"),
      interim: state.interim,
      shortcut
    });
  }
  function updateButton() {
    if (!ui) return;
    const live = state.mode !== "idle";
    ui.mic.dataset.live = String(live);
    ui.mic.setAttribute("aria-label", live ? "Stop dictation" : "Start dictation");
    ui.mic.innerHTML = live
      ? '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
    if (!live && buttonTarget && deepActive() !== buttonTarget) hideButton();
  }

  function release() {
    clearTimeout(state.stopTimer); clearTimeout(state.watchdog);
    const r = state.rec;
    state.rec = null;
    if (r) { r.onresult = r.onerror = r.onend = r.onaudiostart = null; try { r.abort(); } catch { /* already stopped */ } }
  }

  function start(target) {
    if (state.mode !== "idle") return;
    if (!SR) { showPill({ kind: "error", text: "This browser can’t turn speech into text. Use Chrome or Edge.", autoHide: 6000 }); return; }
    target = editingHost(target);
    Object.assign(state, { mode: "live", session: state.session + 1, target, saved: saveSelection(target), finalRaw: "", interim: "",
      heard: false, stopRequested: false, cancelled: false, restarts: 0, error: null });
    if (settings.showButton) showButtonFor(target);
    updateButton();
    const rec = new SR();
    state.rec = rec;
    rec.lang = settings.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onaudiostart = () => { if (rec !== state.rec) return; state.heard = true; render(); };
    rec.onresult = e => {
      if (rec !== state.rec) return;
      state.heard = true; state.restarts = 0;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) state.finalRaw += " " + r[0].transcript; else interim += r[0].transcript;
      }
      state.interim = interim.trim();
      render();
    };
    rec.onerror = e => {
      if (rec !== state.rec || e.error === "no-speech" || e.error === "aborted") return;
      state.error = e.error; state.stopRequested = true;
    };
    rec.onend = () => {
      if (rec !== state.rec) return;
      // Chrome ends a session after a pause. Keep listening until the person says they're done.
      if (state.mode === "live" && !state.stopRequested && state.restarts < 50) {
        state.restarts++;
        if (state.interim) { state.finalRaw += " " + state.interim; state.interim = ""; }
        try { rec.start(); return; } catch { /* fall through */ }
      }
      finish();
    };
    try { rec.start(); } catch { state.error = "no-start"; finish(); return; }
    const session = state.session;
    state.watchdog = setTimeout(() => {
      if (state.mode === "live" && state.session === session && !state.heard) { state.error = "no-start"; finish(); }
    }, 30000);
    render();
  }

  function stop() {
    if (state.mode !== "live") return;
    state.stopRequested = true;
    try { state.rec && state.rec.stop(); } catch { finish(); return; }
    clearTimeout(state.stopTimer);
    const session = state.session;
    state.stopTimer = setTimeout(() => { if (state.mode === "live" && state.session === session) finish(); }, 1500);
  }

  function cancel() {
    if (state.mode !== "live") return;
    state.cancelled = true;
    finish();
  }

  function finish() {
    if (state.mode === "idle") return;
    release();
    const raw = (state.finalRaw + " " + state.interim).trim();
    const { target, saved, error, cancelled } = state;
    state.mode = "idle";
    updateButton();
    if (cancelled) { showPill({ kind: "info", text: "Cancelled. Nothing was typed.", autoHide: 2000, announce: "Dictation cancelled" }); return; }
    if (error && !raw) { showPill({ kind: "error", text: ERRORS[error] || "Dictation stopped (" + error + "). Try again.", autoHide: 9000, announce: "Dictation stopped" }); return; }
    if (!raw) { showPill({ kind: "info", text: "Didn’t catch that. Try again a little closer to the microphone.", autoHide: 3500 }); return; }
    const typed = insertDictation(target, raw, saved);
    if (typed) {
      showPill({ kind: "done", text: typed.trim(), autoHide: 1600, announce: "Typed: " + typed.trim() });
    } else {
      const text = Format.format(raw, true);
      showPill({ kind: "error", text, hint: "This box didn’t accept typing. Copy the text and paste it.", copy: text, autoHide: 20000 });
    }
  }

  // Escape cancels while listening (and doesn't close the page's own dialog).
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && state.mode === "live") { e.preventDefault(); e.stopImmediatePropagation(); cancel(); }
  }, true);

  /* ---------------- Keyboard shortcut (sent by the extension's background script) ---------------- */
  function onToggle(msg) {
    if (msg && msg.shortcut) shortcut = msg.shortcut;
    if (state.mode !== "idle") { stop(); return; }
    if (!document.hasFocus()) return;
    const a = deepActive();
    if (isEditable(a)) { start(a); return; }
    // Only the top frame explains; frames pass focus down to the one that has the text box.
    if (IS_TOP && !(a && /^(IFRAME|FRAME)$/.test(a.tagName))) {
      showPill({ kind: "info", text: "Click in a text box first, then press " + shortcut + ".", autoHide: 3500 });
    }
  }
  try {
    chrome.runtime.onMessage.addListener(msg => { if (msg && msg.type === "fluidvoice:toggle") onToggle(msg); });
  } catch { /* extension was reloaded */ }
})();
