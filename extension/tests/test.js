// Tests for the FluidVoice extension.
//
// Part 1 runs the page script in a normal page with a fake microphone and a stand-in for the chrome.* APIs,
// and checks that dictated text lands in textareas, inputs, rich-text boxes and frames.
// Part 2 loads the real extension into Chromium and checks that it installs, its menu opens and it reaches pages.
//
// Run from the extension/tests folder:
//   npm install --no-save playwright && npx playwright install chromium
//   node test.js
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const EXT = path.resolve(__dirname, "..");
const results = [];
const check = (name, got, expected) => { const pass = typeof expected === "function" ? expected(got) : got === expected; results.push({ name, pass, got, expected: typeof expected === "function" ? "(condition)" : expected }); };

// Serve the extension folder so test pages can load its scripts.
const server = http.createServer((req, res) => {
  const file = path.join(EXT, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(EXT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": file.endsWith(".html") ? "text/html" : "text/javascript" });
  fs.createReadStream(file).pipe(res);
});

// A fake SpeechRecognition and chrome.* stand-ins, installed in every frame before the page script.
const STUBS = () => {
  window.__recs = [];
  class FakeSR {
    constructor() { this.running = false; window.__recs.push(this); window.top.__lastRec = this; }
    start() { if (this.running) throw new Error("already started"); this.running = true; setTimeout(() => this.onaudiostart && this.onaudiostart(), 30); }
    stop() { setTimeout(() => { if (!this.running) return; this.running = false; this.onend && this.onend(); }, 60); }
    abort() { this.running = false; }
    emit(text) { const r = [{ transcript: text }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); }
    fail(error) { this.onerror && this.onerror({ error }); this.running = false; this.onend && this.onend(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  const listeners = [];
  window.__toggle = () => listeners.forEach(fn => fn({ type: "fluidvoice:toggle", shortcut: "Alt+Shift+D" }));
  window.chrome = {
    runtime: { onMessage: { addListener: fn => listeners.push(fn) }, sendMessage: () => Promise.resolve("Alt+Shift+D") },
    storage: { local: { get: (d, cb) => setTimeout(() => cb(d), 0) }, onChanged: { addListener() {} } }
  };
};
const SCRIPTS = ["defaults.js", "format.js", "content.js"];

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();

  /* ---------- Part 1: page script with a fake microphone ---------- */
  const ctx = await browser.newContext();
  await ctx.addInitScript(STUBS);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(base + "/tests/page.html");
  for (const f of page.frames()) for (const s of SCRIPTS) await f.addScriptTag({ url: base + "/" + s });
  await page.waitForTimeout(100);

  const toggleIn = frame => frame.evaluate(() => window.__toggle());
  const emit = text => page.evaluate(t => window.__lastRec.emit(t), text);
  async function dictate(frame, text) {
    await toggleIn(frame); await page.waitForTimeout(80);
    await emit(text);
    await toggleIn(frame); await page.waitForTimeout(250);
  }

  // Textarea: continues after "Hello there." with a space and a capital letter.
  await page.click("#ta"); await page.keyboard.press("End");
  await dictate(page.mainFrame(), "um see you at five comma okay question mark");
  check("textarea: appended as a new sentence", await page.$eval("#ta", t => t.value), "Hello there. See you at five, okay?");

  // Input: continues the phrase in lowercase.
  await page.click("#inp"); await page.keyboard.press("End");
  await dictate(page.mainFrame(), "for the fluid voice launch");
  check("input: continues mid-sentence, dictionary applied", await page.$eval("#inp", t => t.value), "Meeting notes for the FluidVoice launch");

  // Rich-text (contenteditable) box.
  await page.click("#ce p"); await page.keyboard.press("End");
  await dictate(page.mainFrame(), "and the second part period");
  check("contenteditable: inserted at the cursor", await page.$eval("#ce", t => t.innerText.trim()), "First line and the second part.");

  // Password fields are never used.
  await page.click("#pw");
  await toggleIn(page.mainFrame()); await page.waitForTimeout(80);
  check("password field: no dictation starts", await page.evaluate(() => window.__recs.filter(r => r.running).length), 0);

  // Inside a frame: text goes into the frame's box.
  const frame = page.frame({ url: /frame\.html/ });
  await frame.click("#fta");
  await dictate(frame, "hello from the frame");
  check("iframe: inserted into the frame's textarea", await frame.$eval("#fta", t => t.value), "Hello from the frame");

  // Esc cancels without typing anything.
  await page.click("#ta"); await page.keyboard.press("End");
  const before = await page.$eval("#ta", t => t.value);
  await toggleIn(page.mainFrame()); await page.waitForTimeout(80);
  await emit("this should not appear");
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  check("Esc cancels: text unchanged", await page.$eval("#ta", t => t.value), before);
  check("Esc cancels: microphone released", await page.evaluate(() => window.__recs.filter(r => r.running).length), 0);

  // Microphone blocked: nothing typed, recognizer stopped.
  await toggleIn(page.mainFrame()); await page.waitForTimeout(80);
  await page.evaluate(() => window.__lastRec.fail("not-allowed")); await page.waitForTimeout(150);
  check("blocked microphone: text unchanged", await page.$eval("#ta", t => t.value), before);

  // Nothing focused: no recording.
  await page.click("#plain");
  await toggleIn(page.mainFrame()); await page.waitForTimeout(80);
  check("no text box focused: no dictation starts", await page.evaluate(() => window.__recs.filter(r => r.running).length), 0);

  // The page's own typing events fire, so sites like chat apps notice the new text.
  await page.evaluate(() => { window.__inputs = 0; document.querySelector("#inp").addEventListener("input", () => window.__inputs++); });
  await page.click("#inp"); await page.keyboard.press("End");
  await dictate(page.mainFrame(), "again");
  check("input event fired for the page", await page.evaluate(() => window.__inputs), n => n >= 1);

  await page.screenshot({ path: path.join(__dirname, "shots-page.png") });
  check("no JavaScript errors on the page", errors.join(" | "), "");
  await ctx.close();
  await browser.close();

  /* ---------- Part 2: the real extension ---------- */
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fv-ext-"));
  const ext = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  let [worker] = ext.serviceWorkers();
  if (!worker) worker = await ext.waitForEvent("serviceworker", { timeout: 15000 });
  const id = worker.url().split("/")[2];
  check("extension installs and its background script starts", !!id, true);
  await new Promise(r => setTimeout(r, 1000));
  check("welcome page opens after install", ext.pages().some(p => p.url().endsWith("/welcome.html")), true);

  const popup = await ext.newPage();
  const popupErrors = [];
  popup.on("pageerror", e => popupErrors.push(e.message));
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForTimeout(300);
  check("menu: language list filled", await popup.$$eval("#lang option", o => o.length), 20);
  check("menu: starter dictionary shown", await popup.$$eval("#dict-list .dict-item", r => r.length), 4);
  await popup.fill("#d-from", "lamine doe"); await popup.fill("#d-to", "Lamine");
  await popup.click("#dict-form button");
  await popup.waitForTimeout(200);
  check("menu: adding a word saves it", await worker.evaluate(() => chrome.storage.local.get("dictionary").then(v => v.dictionary.map(e => e.replacement))), v => v.includes("Lamine"));
  await popup.setViewportSize({ width: 360, height: 900 });
  await popup.screenshot({ path: path.join(__dirname, "shots-popup.png"), fullPage: true });
  check("menu: no JavaScript errors", popupErrors.join(" | "), "");

  const site = await ext.newPage();
  await site.goto(base + "/tests/page.html");
  await site.click("#ta");
  await site.waitForTimeout(400);
  check("page script runs on websites (mic button added)", await site.$$eval("fluidvoice-ui", h => h.length), n => n >= 1);
  const welcome = ext.pages().find(p => p.url().endsWith("/welcome.html"));
  if (welcome) { await welcome.setViewportSize({ width: 900, height: 1100 }); await welcome.screenshot({ path: path.join(__dirname, "shots-welcome.png"), fullPage: true }); }
  await ext.close();
  server.close();

  const failed = results.filter(r => !r.pass);
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : `  got ${JSON.stringify(r.got)}, expected ${JSON.stringify(r.expected)}`}`);
  console.log(`\n${results.length - failed.length} of ${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
