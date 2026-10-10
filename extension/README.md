# FluidVoice Dictation for Chrome

Talk into any text box on the web: Gmail, Google Docs, ChatGPT, Slack, LinkedIn, forms… FluidVoice types what you say where your cursor is, with the same spoken punctuation, filler-word removal and dictionary as the FluidVoice web app.

## Install it (about 2 minutes)

1. **Download** <https://laminedo.github.io/FluidVoice/fluidvoice-extension.zip> and double-click it to unzip. You get a folder called `fluidvoice-extension`.
2. **Move that folder somewhere it can stay**, such as your Documents folder. Chrome runs the extension from it, so don't delete it.
3. In Chrome, go to `chrome://extensions` (type it in the address bar).
4. Turn on **Developer mode** (the switch in the top-right corner).
5. Click **Load unpacked** and choose the `fluidvoice-extension` folder.
6. A welcome page opens with a practice box. To keep the menu handy, click the puzzle-piece icon next to the address bar, then the pin next to **FluidVoice Dictation**.

It also works in Microsoft Edge (`edge://extensions`, same steps) and other Chrome-based browsers. Brave and Opera don't include a speech service, so dictation won't work there.

## Use it

1. Click in a text box on any website.
2. Press **Alt+Shift+D** (on a Mac: **⌥ Option + ⇧ Shift + D**), or click the small microphone that appears in the box.
3. The first time on each website, Chrome asks to use your microphone. Choose **Allow**.
4. Talk. A bubble at the bottom of the page shows your words. Say "comma", "period", "question mark" or "new line" where you want them.
5. Press the shortcut again or click **Done**, and the text is typed in. Press **Esc** to cancel.

Click the extension's icon to change the language, turn options on or off, add words to your dictionary, or change the shortcut.

## Good to know

- **Websites only.** Extensions can't type into desktop apps like Word or Mail, or into Chrome's own pages and the Chrome Web Store. To type into any Mac app, use the FluidVoice Mac app.
- **Password fields are never used.**
- **Privacy:** your audio goes to the browser's online speech service (Google in Chrome, Microsoft in Edge). Settings and your dictionary stay in this browser.
- **If a site blocks the microphone,** click the microphone icon in the address bar and choose Allow. A few sites block microphones in their embedded editors; the bubble then offers a Copy button so you can paste the text.

## For developers

- `format.js` is generated from the web app (`web/index.html`) so both use the same rules. After changing the rules there, run `python3 extension/sync-format.py`.
- `python3 extension/package.py` rebuilds `web/fluidvoice-extension.zip` for the website.
- `extension/tests/test.js` runs the tests: typing into textareas, inputs, rich-text boxes and frames with a fake microphone, plus installing the real extension in Chromium.
