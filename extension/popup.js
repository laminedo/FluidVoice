// Settings and dictionary for the extension. Used by popup.html and welcome.html.
(() => {
  "use strict";
  const D = globalThis.FLUIDVOICE_DEFAULTS;
  const $ = s => document.querySelector(s);
  let settings = Object.assign({}, D);

  const save = patch => {
    Object.assign(settings, patch);
    chrome.storage.local.set(patch);
  };

  function renderDictionary() {
    const list = $("#dict-list");
    if (!list) return;
    list.replaceChildren();
    if (!settings.dictionary.length) {
      const p = document.createElement("div");
      p.className = "empty";
      p.textContent = "No words yet. Add a name FluidVoice keeps spelling wrong.";
      list.append(p);
    }
    for (const e of settings.dictionary) {
      const row = document.createElement("div");
      row.className = "dict-item";
      const from = document.createElement("span"); from.className = "from"; from.textContent = e.triggers.join(", ");
      const arrow = document.createElement("span"); arrow.className = "hint"; arrow.textContent = "→"; arrow.setAttribute("aria-hidden", "true");
      const to = document.createElement("span"); to.className = "to"; to.textContent = e.replacement;
      const del = document.createElement("button");
      del.className = "icon-btn"; del.type = "button"; del.title = "Remove"; del.setAttribute("aria-label", "Remove " + e.replacement);
      del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l.8 11.5A2 2 0 0 0 9.3 20.5h5.4a2 2 0 0 0 2-2L17.5 7M9.5 7V4.5h5V7"/></svg>';
      del.addEventListener("click", () => {
        save({ dictionary: settings.dictionary.filter(x => x !== e) });
        renderDictionary();
        ($("#dict-list .icon-btn") || $("#d-from")).focus();
      });
      row.append(from, arrow, to, del);
      list.append(row);
    }
  }

  function init(values) {
    settings = Object.assign({}, D, values);
    const lang = $("#lang");
    if (lang) {
      for (const [code, name] of globalThis.FLUIDVOICE_LANGUAGES) {
        const o = document.createElement("option"); o.value = code; o.textContent = name; lang.append(o);
      }
      lang.value = settings.lang;
      lang.addEventListener("change", () => save({ lang: lang.value }));
    }
    for (const key of ["spokenPunctuation", "removeFillers", "autoCapitalize", "showButton"]) {
      const input = document.getElementById(key);
      if (!input) continue;
      input.checked = !!settings[key];
      input.addEventListener("change", () => save({ [key]: input.checked }));
    }
    renderDictionary();

    const form = $("#dict-form");
    if (form) form.addEventListener("submit", e => {
      e.preventDefault();
      const triggers = Array.from(new Set($("#d-from").value.split(",").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean)));
      const replacement = $("#d-to").value.trim();
      const msg = $("#d-msg");
      if (!triggers.length || !replacement) {
        msg.textContent = !triggers.length ? "Type what FluidVoice hears, like “fluid voice”." : "Type the word it should write, like “FluidVoice”.";
        msg.classList.add("error");
        (!triggers.length ? $("#d-from") : $("#d-to")).focus();
        return;
      }
      // A phrase can only point at one word: take it away from any older entry first.
      const lower = triggers.map(t => t.toLowerCase());
      let dict = settings.dictionary.map(x => ({ ...x, triggers: x.triggers.filter(t => !lower.includes(t.toLowerCase())) })).filter(x => x.triggers.length);
      const existing = dict.find(x => x.replacement.toLowerCase() === replacement.toLowerCase());
      if (existing) { existing.triggers = Array.from(new Set([...existing.triggers, ...triggers])); existing.replacement = replacement; }
      else dict = [{ id: Date.now().toString(36), triggers, replacement }, ...dict];
      save({ dictionary: dict });
      renderDictionary();
      $("#d-from").value = ""; $("#d-to").value = ""; $("#d-from").focus();
      msg.textContent = "Added " + replacement + ".";
      msg.classList.remove("error");
    });
  }

  chrome.storage.local.get(D, init);

  chrome.commands.getAll(cmds => {
    const c = cmds.find(x => x.name === "toggle-dictation");
    const label = c && c.shortcut;
    document.querySelectorAll("#shortcut, .shortcut").forEach(k => { k.textContent = label || "no shortcut set"; });
    if (!label) { const h = $("#shortcut-hint"); if (h) h.textContent = "No shortcut is set yet. Choose one, or use the mic button."; }
  });
  const change = $("#change-shortcut");
  if (change) change.addEventListener("click", () => chrome.runtime.sendMessage({ type: "fluidvoice:open-shortcuts" }));
})();
