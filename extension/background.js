// Relays the keyboard shortcut to the page, and shows the welcome page after installing.
const PAGE_SCRIPTS = ["defaults.js", "format.js", "content.js"];

async function currentShortcut() {
  try {
    const cmd = (await chrome.commands.getAll()).find(c => c.name === "toggle-dictation");
    return (cmd && cmd.shortcut) || "";
  } catch { return ""; }
}

async function sendToggle(tab) {
  if (!tab || tab.id == null) return;
  const msg = { type: "fluidvoice:toggle", shortcut: await currentShortcut() };
  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    // The extension's own pages (like the welcome page) listen on runtime messages instead.
    chrome.runtime.sendMessage(msg).catch(() => {});
    // Tabs opened before the extension was installed don't have the page script yet. Add it, then try again.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: PAGE_SCRIPTS });
      await chrome.tabs.sendMessage(tab.id, msg);
    } catch {
      // Chrome doesn't let extensions run on its own pages (chrome://, the Web Store). Nothing to do there.
    }
  }
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "toggle-dictation") return;
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  sendToggle(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "fluidvoice:get-shortcut") {
    currentShortcut().then(sendResponse);
    return true;
  }
  if (msg && msg.type === "fluidvoice:open-shortcuts") chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  return false;
});

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
});
