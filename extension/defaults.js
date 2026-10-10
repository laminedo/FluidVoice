// Settings shared by the popup, the welcome page and the script that runs on web pages.
globalThis.FLUIDVOICE_DEFAULTS = {
  lang: "en-US",
  spokenPunctuation: true,
  removeFillers: true,
  autoCapitalize: true,
  showButton: true,
  dictionary: [
    { id: "s1", triggers: ["fluid voice", "flu voice", "fluid boys"], replacement: "FluidVoice" },
    { id: "s2", triggers: ["g mail", "gee mail"], replacement: "Gmail" },
    { id: "s3", triggers: ["mac book"], replacement: "MacBook" },
    { id: "s4", triggers: ["friday"], replacement: "Friday" }
  ]
};

globalThis.FLUIDVOICE_LANGUAGES = [
  ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["en-AU", "English (Australia)"], ["en-IN", "English (India)"],
  ["fr-FR", "Français"], ["es-ES", "Español (España)"], ["es-MX", "Español (México)"], ["de-DE", "Deutsch"],
  ["it-IT", "Italiano"], ["pt-BR", "Português (Brasil)"], ["nl-NL", "Nederlands"], ["sv-SE", "Svenska"],
  ["pl-PL", "Polski"], ["tr-TR", "Türkçe"], ["ru-RU", "Русский"], ["ar-SA", "العربية"], ["hi-IN", "हिन्दी"],
  ["ja-JP", "日本語"], ["ko-KR", "한국어"], ["zh-CN", "中文 (普通话)"]
];
