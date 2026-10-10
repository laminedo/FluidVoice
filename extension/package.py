#!/usr/bin/env python3
"""Build the downloadable extension ZIP that the website offers.

    python3 extension/package.py

Writes web/fluidvoice-extension.zip, which GitHub Pages serves at
https://laminedo.github.io/FluidVoice/fluidvoice-extension.zip
"""
import subprocess, sys, zipfile
from pathlib import Path

ext = Path(__file__).resolve().parent
root = ext.parent
subprocess.run([sys.executable, str(ext / "sync-format.py")], check=True)  # make sure the rules match the web app

FILES = ["manifest.json", "defaults.js", "format.js", "content.js", "background.js",
         "popup.html", "popup.css", "popup.js", "welcome.html", "README.md",
         "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png"]
out = root / "web" / "fluidvoice-extension.zip"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in FILES:
        # Everything sits in one folder, so unzipping gives a "fluidvoice-extension" folder to load in Chrome.
        info = zipfile.ZipInfo("fluidvoice-extension/" + f, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, (ext / f).read_bytes())
print(f"Wrote {out.relative_to(root)} ({out.stat().st_size // 1024} KB)")
