# Changelog

## 0.6.0

- Add **Find in Files (New Window)** to open JetBrains Finder in a separate VS Code window.
- Keep the existing Find in Files command and shortcut unchanged.
- Make the selected-result preview editable with automatic saving, conflict checks and theme-aware syntax highlighting.

## 0.5.1

- Use the active VS Code TextMate theme and installed grammars in the editable lower pane.
- Apply token color customizations and refresh highlighting on theme changes without resetting edits, cursor or Undo.

## 0.5.0

- Make the lower code pane editable immediately, with automatic saving and no Edit or Save controls.
- Add CodeMirror syntax highlighting, line numbers, indentation, bracket matching and Undo.
- Preserve rapid input during asynchronous saves and flush drafts before navigation and on close.
- Protect external changes with document/disk snapshot checks and recover conflicted drafts on close.
- Bundle the editor locally; no CDN or online editor dependency.

## 0.4.1

- Rename the displayed extension and command category to JetBrains Finder.
- Keep the Marketplace identifier and command IDs unchanged for existing installations.

## 0.4.0

- Add Ctrl+Shift+R / Replace in Files in the same search and context-preview window.
- Preview and apply a selected match or all results, with Cancel and Apply and Save controls.
- Support empty replacements and JavaScript capture-group substitutions in regular-expression mode.
- Reject stale previews, dirty files, incomplete searches and truncated result sets before applying edits.
- Add replacement planning and controller regression tests.

## 0.3.66

Initial Linux fork of upstream 0.3.66 (`96dc659`).

- Build and publish a Linux x64 VSIX with a Linux ripgrep executable.
- Use publisher Toximiner and independent `jetbrainsFinderLinux` command and view IDs.
- Add automated tests, Linux packaging, GitHub releases and Marketplace Trusted Publishing.
- Preserve upstream MIT attribution and search/preview behavior.
