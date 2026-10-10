# FluidVoice for the web

A browser version of FluidVoice: talk, and it writes clean text. It is one file, `index.html`, with no build step and nothing to install.

![FluidVoice web app, light mode](screenshots/desktop-light.png)

## What it does

- **Dictate**: press the microphone (or <kbd>Space</kbd>) and talk. Words appear live, in gray until the browser is sure of them.
- **Spoken punctuation**: say "comma", "period", "question mark", "new line" and more. The full list is in the **Commands** tab.
- **Filler words removed**: um, uh, er, hmm and similar sounds are dropped, using the same list as the Mac app.
- **Dictionary**: teach it words it gets wrong, for example "fluid voice" becomes "FluidVoice".
- **Clean up**: fixes spacing, capitals and fillers in text you already have.
- **Write Mode** (only when opened inside Claude): rewrites your text as polished prose, an email, bullet points or a shorter version.
- **History and Today stats**: words dictated, speaking pace, and time saved compared with typing.
- **Light and dark mode**, and the Mac app's five accent colors.

## How to open it

**Quickest:** double-click `web/index.html` to open it in **Chrome**, **Edge** or **Safari**. When the browser asks for the microphone, allow it.

**If the microphone doesn't work from a file**, run a tiny local web server. Open Terminal in the `web` folder and run:

```bash
python3 -m http.server 8000
```

Then go to <http://localhost:8000> in Chrome or Safari.

**To share it online**, turn on GitHub Pages for this repository (Settings → Pages) and choose the `web` folder, or upload `index.html` to any static host such as Netlify or Vercel. The site must use `https://` or the browser won't allow the microphone.

## Good to know

- Firefox can't turn speech into text yet. The app tells you, and you can still type, use Clean up and play the sample.
- Chrome and Edge send your audio to Google's speech service; Safari uses Apple's. The native Mac app runs fully on your device.
- History, dictionary and settings are saved in your browser (`localStorage`). They don't sync between browsers or devices.

## Checking the app

`tests/audit.js` opens the app in a headless browser and checks the text formatting, the main buttons, accessibility and phone layout. See [AUDIT.md](AUDIT.md) for the latest results.
