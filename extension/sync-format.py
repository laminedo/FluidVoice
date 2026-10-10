#!/usr/bin/env python3
"""Copy the text-formatting rules from the web app into the extension.

The web app (web/index.html) is the source of truth for spoken punctuation,
filler words, the dictionary and capitalization. Run this after changing them:

    python3 extension/sync-format.py
"""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / "web" / "index.html").read_text(encoding="utf-8")

start = html.index("  // English filler sounds only")
end = html.index("  // Local clean-up for text that is already written")
rules = html[start:end].rstrip() + "\n"

out = f'''// GENERATED from web/index.html by extension/sync-format.py. Don't edit by hand:
// change the web app, then run `python3 extension/sync-format.py`.
globalThis.FluidVoiceFormat = (() => {{
  "use strict";
  let settings = {{ lang: "en-US", spokenPunctuation: true, removeFillers: true, autoCapitalize: true }};
  let dictionary = [];
  const isEnglish = () => String(settings.lang || "").toLowerCase().startsWith("en");

{rules}
  return {{
    configure(newSettings, newDictionary) {{
      settings = Object.assign({{}}, settings, newSettings);
      dictionary = Array.isArray(newDictionary) ? newDictionary : [];
    }},
    format: (raw, atStart = true) => formatTranscript(raw, settings, atStart),
    COMMAND_GROUPS
  }};
}})();
'''
(root / "extension" / "format.js").write_text(out, encoding="utf-8")
print("Wrote extension/format.js")
