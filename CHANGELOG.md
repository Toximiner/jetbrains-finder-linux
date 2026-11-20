# Changelog

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
