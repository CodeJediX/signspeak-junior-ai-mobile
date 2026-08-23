# App Overview

SignSpeak Junior AI Mobile v2.0 is organized around one primary child workflow:

1. Choose a word card.
2. Build a sentence.
3. Press Speak to hear the message.

The interface also includes parent controls for voice speed, focus mode, suggestions, custom vocabulary, custom images, and the on-device AI helper.

## Main Screens

- **Sentence builder:** shows the current message, selected word tiles, undo, clear, stop voice, and speak controls.
- **Junior AI Helper:** predicts intent, displays confidence, suggests next words, and offers a best-suggestion shortcut.
- **Quick phrases:** gives immediate access to common messages.
- **Word library:** lets the child browse, search, and favorite words.
- **Parent settings:** lets a caregiver personalize the experience and add custom vocabulary.

## Technical Notes

- The APK contains a web app bundle under `assets/www`.
- The extracted bundle is preserved in this repo under `web/`.
- Native Android Text-to-Speech is accessed through `window.AndroidBridge` when running inside the APK.
- Desktop browser preview uses standard browser speech synthesis when available.
- The AI helper is implemented in `web/ai_engine.js` and powered by `web/ai_model.js`.
