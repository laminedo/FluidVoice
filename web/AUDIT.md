# FluidVoice Web: design and quality audit

**Date:** October 10, 2026 · **File checked:** `web/index.html`

The audit compares the web app with Apple's Human Interface Guidelines (HIG) and standard web accessibility rules (WCAG 2.1 AA). It was run in headless Chromium at desktop width (1280px) and phone width (390px), in light and dark mode. You can re-run it with `tests/audit.js`.

## Result

| Check | Result |
| --- | --- |
| Text formatting tests (punctuation, fillers, dictionary, capitals, clean up, word count) | 19 of 19 pass |
| Main flows: sample dictation, save to history, clean up, undo, add a dictionary word, form errors, theme, accent, Space shortcut | All work |
| JavaScript errors in the console | None |
| Page scrolls sideways | Never, on any screen |
| Accessibility (axe-core 4.10, all 5 screens at desktop and phone width in light mode, and at phone width in dark mode) | 0 violations |
| Touch targets of at least 44 × 44pt on phones | All except the native-size switches and segmented control (see below) |

## What Apple's guidelines ask for, and how the app meets them

| HIG principle | How the app meets it |
| --- | --- |
| **Clarity**: system font, clear hierarchy | Uses San Francisco (the system font) on Apple devices and Segoe UI on Windows. Text sizes follow Apple's text styles: Large Title 34, Title 3 20, Body 17, Footnote 13. Stats use SF Rounded, as Apple's Fitness and Screen Time do. |
| **Deference**: content first | The transcript is the largest element on screen. Colors are neutral, and the accent is used only for the main action and links. |
| **Depth**: materials | The sidebar and phone tab bar use a translucent, blurred material, like macOS sidebars and the iOS tab bar. |
| **Familiar navigation** | macOS-style sidebar on desktop. On phones it becomes an iOS tab bar fixed to the bottom, with room for the home indicator. |
| **Native-looking controls** | iOS-style switches, segmented control, grouped settings lists, pill buttons and a Voice Memos-style live waveform. |
| **Dark Mode** | A full dark palette using Apple's dark system colors (#000 base, #1C1C1E surfaces). It follows the system setting, and you can override it in Settings. |
| **Color contrast** | All text meets 4.5:1 in both themes and with all five accent colors. The accent colors were darkened for text so they stay readable. |
| **Touch targets of 44 × 44pt** | Every button, icon button, input and color swatch is at least 44pt on phones. |
| **Reduce Motion** | When the system's Reduce Motion setting is on, animations are switched off. |
| **Feedback** | A status pill (Ready, Listening, Playing sample, Thinking…), a live waveform, a timer, and toasts that confirm actions ("Copied", "Saved 33 words to History"). |
| **Forgiveness** | Clear, Clean up and Write Mode can all be undone. Deleting all history asks for confirmation on the page first. |
| **Plain language** | Errors say what went wrong and how to fix it, for example "Allow microphone access for this page in your browser's address bar, then press the microphone again." |
| **Keyboard and VoiceOver** | Every control can be reached and used with the keyboard, focus is always visible, and icon buttons have spoken labels. The color swatches work with arrow keys like a native radio group, and live text is announced as it changes. |

## Problems found and fixed during the audit

1. **Low-contrast text on two buttons.** "Clean up" measured 4.26:1 and "Clear history" 4.32:1, below the 4.5:1 minimum. The cyan and red text colors were darkened, and the green, blue, purple and orange accents were adjusted so every accent passes.
2. **White text on blue and purple buttons** measured 3.7:1 and 4.0:1. Those accents now use dark text on the colored button.
3. **Buttons too small to tap on phones.** 25 controls were 28 to 40px tall. They are now at least 44px on touch screens.
4. **Headings out of order** on the Commands page (Heading 1 jumped to Heading 3). Fixed for screen readers.
5. **"Listening" could stay on forever** in browsers that have speech recognition but never start it (seen in headless Chromium). A 6-second check now stops it and explains what to do. Blocked microphone permission is also detected before recording starts.
6. **Clean up missed two cases**: a lowercase "i" stayed lowercase, and "fine.new" didn't get a space. Both fixed, and "google.com" stays intact.
7. **The sidebar stopped halfway down** on long pages. It is now pinned to the full window height.
8. **"Press Space" hint shown on phones**, which have no Space key. It now shows only on devices with a keyboard and mouse.
9. **Cards stretched over empty space** on the Commands page. They now take only the height of their content.

## Accepted as is

- **Switches are 51 × 31pt and the segmented control is 40pt tall.** These are Apple's own native sizes. Each switch's whole label is also tappable, so the real tap area is the full row.

## Not covered by this audit

- **Real microphone dictation.** The test machine has no microphone, and Chromium's speech service was blocked on its network. The live-dictation code follows the standard Web Speech API. The same formatting it uses was tested through the sample dictation and the unit tests. Try it once in Chrome and once in Safari on your own device.
- **Safari and iOS.** Only Chromium was automated. The layout uses standard CSS that Safari supports, but test it on an iPhone before sharing widely.
- **Write Mode with Claude** only runs when the page is opened inside Claude, so it couldn't run in the test browser. Outside Claude it hides itself, and Settings says it's "Not available here".

## Screenshots

| Desktop, light | Dictating a sample | Settings, dark |
| --- | --- | --- |
| ![Desktop light](screenshots/desktop-light.png) | ![Dictating](screenshots/desktop-dictating.png) | ![Settings dark](screenshots/desktop-dark-settings.png) |

| Phone, light | Phone, dark |
| --- | --- |
| ![Phone light](screenshots/phone-light.png) | ![Phone dark](screenshots/phone-dark.png) |
