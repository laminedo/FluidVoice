// GENERATED from web/index.html by extension/sync-format.py. Don't edit by hand:
// change the web app, then run `python3 extension/sync-format.py`.
globalThis.FluidVoiceFormat = (() => {
  "use strict";
  let settings = { lang: "en-US", spokenPunctuation: true, removeFillers: true, autoCapitalize: true };
  let dictionary = [];
  const isEnglish = () => String(settings.lang || "").toLowerCase().startsWith("en");

  // English filler sounds only: in other languages several of these are real words (Portuguese "um", German "er").
  const FILLERS = new Set(["um", "uh", "er", "ah", "eh", "umm", "uhh", "err", "ahh", "ehh", "hmm", "hm", "mm", "mmm", "erm", "urm", "ugh"]);
  const TLDS = new Set(["ai", "app", "co", "com", "dev", "edu", "gov", "io", "me", "net", "org", "uk", "us", "html", "js", "json", "md", "py", "swift", "txt"]);

  // Spacing: R = sticks to the word before, L = sticks to the word after, N = no space either side,
  // S = space on both sides, B = line break.
  const COMMAND_GROUPS = [
    { title: "Punctuation", rules: [
      [",", "R", ["comma"]],
      [".", "R", ["period", "full stop"]],
      ["?", "R", ["question mark"]],
      ["!", "R", ["exclamation mark", "exclamation point"]],
      [":", "R", ["colon"]],
      [";", "R", ["semicolon", "semi colon"]],
      ["…", "R", ["ellipsis", "dot dot dot", "three dots"]],
      ["-", "N", ["hyphen"]],
      ["—", "S", ["em dash", "long dash"]],
      [".", "N", ["dot"], "between a name and .com, .io, .org…"]
    ]},
    { title: "Symbols", rules: [
      ["@", "N", ["at sign"]],
      ["&", "S", ["ampersand"]],
      ["#", "L", ["hashtag", "hash sign", "pound sign", "number sign"]],
      ["%", "R", ["percent sign", "percent"], "“percent” right after a number"],
      ["*", "S", ["asterisk"]],
      ["/", "N", ["slash", "forward slash"]],
      ["\\", "N", ["backslash", "back slash"]],
      ["_", "N", ["underscore"]],
      ["|", "S", ["vertical bar"]],
      ["~", "N", ["tilde"]]
    ]},
    { title: "Layout", rules: [
      ["\n", "B", ["new line"]],
      ["\n\n", "B", ["new paragraph"]]
    ]},
    { title: "Brackets and quotes", rules: [
      ["(", "L", ["open parenthesis", "open paren", "left paren"]],
      [")", "R", ["close parenthesis", "close paren", "right paren"]],
      ["[", "L", ["open bracket", "left bracket"]],
      ["]", "R", ["close bracket", "right bracket"]],
      ["{", "L", ["open brace", "left brace"]],
      ["}", "R", ["close brace", "right brace"]],
      ["“", "L", ["open quote", "begin quote"]],
      ["”", "R", ["close quote", "end quote", "unquote"]]
    ]}
  ];
  const RULES = new Map();
  let MAX_WORDS = 1;
  for (const g of COMMAND_GROUPS) for (const [symbol, spacing, phrases] of g.rules) {
    for (const p of phrases) {
      RULES.set(p, { symbol, spacing, phrase: p });
      MAX_WORDS = Math.max(MAX_WORDS, p.split(" ").length);
    }
  }
  const norm = w => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

  function removeFillers(text) {
    if (!isEnglish()) return text;
    const out = [];
    for (const w of text.split(/[ \t]+/)) {
      if (!w) continue;
      const core = norm(w);
      const isFiller = FILLERS.has(core)
        && !/^\p{Lu}{2,}$/u.test(w.replace(/[^\p{L}]/gu, ""))                         // "ER" is an acronym
        && !(/^m+$/.test(core) && out.length && /\d$/.test(out[out.length - 1]));      // "5 mm" is a unit
      if (isFiller) {
        // Keep sentence-ending punctuation that was attached to the filler ("agree, er?" -> "agree?").
        const tail = (w.match(/[.!?…]+$/) || [""])[0];
        if (tail && out.length) out[out.length - 1] = out[out.length - 1].replace(/[,;:]+$/, "") + tail;
        continue;
      }
      out.push(w);
    }
    return out.join(" ");
  }

  function applySpokenPunctuation(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const tokens = [];
    for (let i = 0; i < words.length;) {
      let hit = null, len = 0;
      for (let n = Math.min(MAX_WORDS, words.length - i); n >= 1; n--) {
        const key = words.slice(i, i + n).map(norm).join(" ");
        const rule = RULES.get(key);
        if (!rule) continue;
        if (rule.phrase === "dot" && !(i > 0 && i + 1 < words.length && TLDS.has(norm(words[i + 1])))) continue;
        if (rule.phrase === "percent" && !(i > 0 && /\d$/.test(words[i - 1]))) continue; // "ten percent" stays words, "10 percent" -> "10%"
        hit = rule; len = n; break;
      }
      if (hit) { tokens.push({ t: hit.symbol, sp: hit.spacing }); i += len; }
      else { tokens.push({ t: words[i], sp: "W" }); i++; }
    }
    let out = "";
    let glueNext = true;
    for (const tok of tokens) {
      const glueBefore = tok.sp === "R" || tok.sp === "N" || tok.sp === "B";
      if (tok.sp === "B") out = out.replace(/[ \t]+$/, "");
      // The recognizer sometimes adds its own punctuation; don't double it ("Hi,," -> "Hi,").
      if (tok.sp === "R" && /^[,.;:!?…]$/.test(tok.t) && out.endsWith(tok.t)) { glueNext = false; continue; }
      if (out && !glueBefore && !glueNext) out += " ";
      out += tok.t;
      glueNext = tok.sp === "L" || tok.sp === "N" || tok.sp === "B";
    }
    return out;
  }

  // Scripts written without spaces between words: dictionary entries match anywhere inside a sentence.
  const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dictKey = (t, spaced) => spaced ? t.toLowerCase().replace(/\s+/g, " ") : t.toLowerCase().replace(/\s+/g, "");
  function applyDictionary(text) {
    // One pass over all entries, longest trigger first, so a newer entry can't be undone by an older one.
    const spaced = new Map(), unspaced = new Map();
    for (const e of dictionary) for (const raw of e.triggers) {
      const t = raw.trim();
      if (!t) continue;
      const isNoSpace = NO_SPACE_SCRIPT.test(t);
      const map = isNoSpace ? unspaced : spaced;
      const key = dictKey(t, !isNoSpace);
      if (!map.has(key)) map.set(key, { t, r: e.replacement });
    }
    const alt = (map, sep) => [...map.values()].sort((a, b) => b.t.length - a.t.length).map(x => escapeRe(x.t).replace(/\s+/g, sep)).join("|");
    if (spaced.size) {
      // Whole words only. Marks (\p{M}) count as letters so Hindi vowel signs don't split a word.
      // Han, Kana and Thai letters also count as a boundary: Chinese text puts Latin names right next to them.
      const NS = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Thai}";
      const re = new RegExp("(^|[^\\p{L}\\p{M}\\p{N}]|[" + NS + "])(" + alt(spaced, "\\s+") + ")(?=$|[^\\p{L}\\p{M}\\p{N}]|[" + NS + "])", "giu");
      text = text.replace(re, (m, pre, word) => { const hit = spaced.get(dictKey(word, true)); return pre + (hit ? hit.r : word); });
    }
    if (unspaced.size) {
      const re = new RegExp("(" + alt(unspaced, "\\s*") + ")", "giu");
      text = text.replace(re, word => { const hit = unspaced.get(dictKey(word, false)); return hit ? hit.r : word; });
    }
    return text;
  }

  // Abbreviations like "e.g." and "Dr." don't end a sentence.
  const ABBREV_END = /(?:^|\s)(?:\p{L}\.){2,3}$|(?:^|\s)(?:mr|mrs|ms|dr|st|vs|etc|approx)\.$/iu;
  function capitalize(text, atStart = true) {
    const up = ch => { try { return ch.toLocaleUpperCase(settings.lang); } catch { return ch.toUpperCase(); } };
    // Words with a capital inside are left alone: iPhone, macOS, eBay.
    const camel = (str, at) => /\p{Lu}/u.test((str.slice(at).match(/^[\p{L}\p{M}]+/u) || [""])[0]);
    let s = text.replace(/([.!?]\s+|\n\s*)(\p{Ll})/gu, (m, before, ch, offset, str) =>
      camel(str, offset + before.length) || (before[0] === "." && ABBREV_END.test(str.slice(0, offset + 1))) ? m : before + up(ch));
    if (atStart) s = s.replace(/^(\s*)(\p{Ll})/u, (m, before, ch, offset, str) => camel(str, before.length) ? m : before + up(ch));
    if (isEnglish()) s = s.replace(/(^|[^\p{L}\p{N}'’])i(?=$|[\s,;:!?'’]|\.(?!\p{L}))/gu, (m, pre) => pre + "I");
    return s;
  }

  // atStart = false when the text continues a sentence that is already on the page.
  function formatTranscript(raw, opts = settings, atStart = true) {
    let s = raw.trim();
    if (!s) return "";
    if (opts.removeFillers) s = removeFillers(s);
    s = opts.spokenPunctuation ? applySpokenPunctuation(s) : s.replace(/\s+/g, " ");
    s = applyDictionary(s);
    if (opts.autoCapitalize) s = capitalize(s, atStart);
    return s.replace(/^[ \t]+|[ \t]+$/g, ""); // keep spoken line breaks at either end
  }

  return {
    configure(newSettings, newDictionary) {
      settings = Object.assign({}, settings, newSettings);
      dictionary = Array.isArray(newDictionary) ? newDictionary : [];
    },
    format: (raw, atStart = true) => formatTranscript(raw, settings, atStart),
    COMMAND_GROUPS
  };
})();
