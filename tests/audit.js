// Functional + design audit for web/index.html
//
// Checks: text-formatting unit tests, the main user flows, console errors,
// sideways scrolling, accessibility (axe-core) and 44pt touch targets on phones,
// in light and dark mode at desktop and phone widths. Screenshots go to the output folder.
//
// Run from the web/ folder:
//   npm install --no-save playwright axe-core && npx playwright install chromium
//   node tests/audit.js index.html tests/shots
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const FILE = "file://" + path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3] || "shots");
fs.mkdirSync(OUT, { recursive: true });

const results = { unit: [], console: [], overflow: [], axe: [], targets: [], flows: [] };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }).catch(() => chromium.launch());

  // ---------- Unit tests of the formatter ----------
  {
    const page = await browser.newPage();
    page.on("console", m => { if (m.type() === "error") results.console.push("[unit] " + m.text()); });
    page.on("pageerror", e => results.console.push("[unit pageerror] " + e.message));
    await page.goto(FILE);
    const cases = [
      ["hey team comma um the fluid voice demo is ready period can we ship it friday question mark", "Hey team, the FluidVoice demo is ready. Can we ship it Friday?"],
      ["hello comma world", "Hello, world"],
      ["first line new line second line", "First line\nSecond line"],
      ["one new paragraph two", "One\n\nTwo"],
      ["email me at john at sign example dot com", "Email me at john@example.com"],
      ["visit google dot com today", "Visit google.com today"],
      ["the dot is small", "The dot is small"],
      ["say open quote hi close quote", "Say “hi”"],
      ["call me open paren maybe close paren", "Call me (maybe)"],
      ["i think i am ready", "I think I am ready"],
      ["uh hmm okay", "Okay"],
      ["wait exclamation mark really question mark", "Wait! Really?"],
      ["well dot dot dot fine", "Well… fine"],
      ["state of the art hyphen free", "State of the art-free"],
      ["Hi, comma there", "Hi, there"],
      ["send to my g mail", "Send to my Gmail"],
      ["", ""],
    ];
    for (const [input, expected] of cases) {
      const got = await page.evaluate(i => window.__fluidvoice.formatTranscript(i), input);
      results.unit.push({ input, expected, got, pass: got === expected });
    }
    const clean = await page.evaluate(() => window.__fluidvoice.cleanUp("um so  i went there , and uh it was fine .new start"));
    results.unit.push({ input: "cleanUp", expected: "So I went there, and it was fine. New start", got: clean, pass: clean === "So I went there, and it was fine. New start" });
    const wc = await page.evaluate(() => window.__fluidvoice.countWords("Hey, it's a well-known test… 42!"));
    results.unit.push({ input: "countWords", expected: 6, got: wc, pass: wc === 6 });
    await page.close();
  }

  // ---------- Screens: each view x width x theme ----------
  const viewports = { desktop: { width: 1280, height: 860 }, phone: { width: 390, height: 844 } };
  const views = ["dictate", "history", "dictionary", "commands", "settings"];
  for (const scheme of ["light", "dark"]) {
    for (const [vpName, vp] of Object.entries(viewports)) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: vpName === "phone" ? 2 : 1, hasTouch: vpName === "phone", isMobile: vpName === "phone" });
      const page = await ctx.newPage();
      page.on("console", m => { if (m.type() === "error") results.console.push(`[${scheme}/${vpName}] ${m.text()}`); });
      page.on("pageerror", e => results.console.push(`[${scheme}/${vpName} pageerror] ${e.message}`));
      await page.goto(FILE + "#dictate");
      // play a sample once so history/stats have content
      if (scheme === "light" && vpName === "desktop") {
        await page.click('.record-hint [data-action="sample"]');
        await page.waitForFunction(() => document.querySelector("#status").dataset.state === "sample");
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${OUT}/dictate-during-sample-${scheme}-${vpName}.png` });
        await page.waitForFunction(() => document.querySelector("#status").dataset.state === "idle", null, { timeout: 30000 });
        const text = await page.$eval("#transcript", t => t.value);
        results.flows.push({ flow: "sample dictation", got: text });
        const histCount = await page.evaluate(() => JSON.parse(localStorage.getItem("fv.history") || "[]").length);
        results.flows.push({ flow: "history saved after sample", got: histCount });
        // Clean up + undo
        await page.fill("#transcript", "um so  i went there , and uh it was fine");
        await page.click("#btn-cleanup");
        results.flows.push({ flow: "clean up", got: await page.$eval("#transcript", t => t.value) });
        await page.click("#btn-undo");
        results.flows.push({ flow: "undo", got: await page.$eval("#transcript", t => t.value) });
        // Dictionary add
        await page.click('.nav-item[data-view="dictionary"]');
        await page.click('#dict-form button[type="submit"]');
        results.flows.push({ flow: "dictionary empty submit error", got: await page.$eval("#d-error", e => e.textContent) });
        await page.fill("#d-triggers", "lamine doe, la mean");
        await page.fill("#d-replacement", "Lamine");
        await page.click('#dict-form button[type="submit"]');
        results.flows.push({ flow: "dictionary added", got: await page.$$eval("#d-list .to", els => els.map(e => e.textContent)) });
        await page.click('.nav-item[data-view="commands"]');
        await page.fill("#tester-in", "ask la mean comma please");
        results.flows.push({ flow: "tester uses dictionary", got: await page.$eval("#tester-out", e => e.textContent) });
        // Settings: dark toggle + accent
        await page.click('.nav-item[data-view="settings"]');
        await page.click('[data-theme-opt="dark"]');
        results.flows.push({ flow: "theme toggle", got: await page.evaluate(() => document.documentElement.dataset.theme) });
        await page.click('[data-theme-opt="system"]');
        await page.click('.swatch[data-accent="purple"]');
        results.flows.push({ flow: "accent", got: await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent")) });
        await page.click('.swatch[data-accent="cyan"]');
        // Space hotkey on dictate (no SpeechRecognition in headless -> notice)
        await page.click('.nav-item[data-view="dictate"]');
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press("Space"); await page.waitForTimeout(7000);
        results.flows.push({ flow: "space hotkey in headless (no mic)", got: await page.$eval("#mic-notice", n => n.hidden ? "notice hidden" : "notice shown: " + document.querySelector("#mic-notice-title").textContent) });
        await page.click('[data-action="dismiss-notice"]');
        await page.fill("#transcript", "");
        await page.dispatchEvent("#transcript", "input");
      } else {
        // seed the same history so screenshots look alike
        await page.evaluate(() => {
          const now = Date.now();
          localStorage.setItem("fv.history", JSON.stringify([
            { id: "a", text: "Hey Sarah, I just tried the FluidVoice web app. It turns what I say into clean text almost instantly!\n\nCan you send the notes to my Gmail before Friday?", raw: "", words: 33, ms: 12400, at: now - 60000, sample: true }
          ]));
        });
        await page.reload();
      }
      for (const v of views) {
        await page.evaluate(v => { location.hash = v; }, v);
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${OUT}/${v}-${scheme}-${vpName}.png`, fullPage: true });
        const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        if (ov.sw > ov.cw) results.overflow.push(`${v}/${scheme}/${vpName}: scrollWidth ${ov.sw} > ${ov.cw}`);
        if (scheme === "light" || vpName === "phone") {
          await page.addScriptTag({ content: axeSource });
          const axe = await page.evaluate(async () => {
            const r = await window.axe.run(document, { resultTypes: ["violations"] });
            return r.violations.map(x => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.slice(0, 4).map(n => n.target.join(" ") + " :: " + (n.failureSummary || "").split("\n").slice(1, 2).join(" ")) }));
          });
          for (const a of axe) results.axe.push({ where: `${v}/${scheme}/${vpName}`, ...a });
        }
        if (vpName === "phone") {
          const small = await page.evaluate(() => {
            const out = [];
            for (const n of document.querySelectorAll("button, a, input, select, textarea, [role=switch], [role=radio]")) {
              const r = n.getBoundingClientRect();
              if (!r.width || !r.height || n.closest("[hidden]")) continue;
              const st = getComputedStyle(n); if (st.visibility === "hidden" || st.display === "none") continue;
              if (r.height < 44 || r.width < 44) out.push(`${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}.${(n.className && n.className.baseVal === undefined ? n.className : "").toString().split(" ")[0]} "${(n.getAttribute("aria-label") || n.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
            }
            return out;
          });
          for (const s of small) results.targets.push(`${v}/${scheme}: ${s}`);
        }
      }
      await ctx.close();
    }
  }
  await browser.close();

  // de-duplicate
  results.targets = Array.from(new Set(results.targets.map(t => t.replace(/^[^:]+\/(light|dark): /, "")))).sort();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const failed = results.unit.filter(u => !u.pass);
  console.log(`UNIT: ${results.unit.length - failed.length}/${results.unit.length} passed`);
  for (const f of failed) console.log("  FAIL", JSON.stringify(f));
  console.log("CONSOLE ERRORS:", results.console.length ? results.console : "none");
  console.log("OVERFLOW:", results.overflow.length ? results.overflow : "none");
  console.log("FLOWS:"); for (const f of results.flows) console.log("  ", f.flow, "=>", JSON.stringify(f.got));
  console.log("AXE VIOLATIONS:", results.axe.length);
  const byId = {};
  for (const a of results.axe) { (byId[a.id] ||= { impact: a.impact, help: a.help, where: [], nodes: new Set() }); byId[a.id].where.push(a.where); a.nodes.forEach(n => byId[a.id].nodes.add(n)); }
  for (const [id, a] of Object.entries(byId)) { console.log(`  [${a.impact}] ${id}: ${a.help} (${a.where.length} screens)`); [...a.nodes].slice(0, 6).forEach(n => console.log("     -", n)); }
  console.log("SMALL TOUCH TARGETS (<44px on phone):", results.targets.length); results.targets.forEach(t => console.log("  ", t));
})().catch(e => { console.error(e); process.exit(1); });
