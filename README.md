# JetBrains Finder

This is an **unofficial Linux x64 fork** of [JetBrains Finder for VS Code by Zeeshan Ahmad](https://github.com/ziishaned/jetbrains-finder-for-vscode), distributed by **Toximiner** under the original MIT license. It is not an official JetBrains product. The upstream version used for this fork is 0.3.66 (commit `96dc659`).

The original search and preview implementation is preserved. This fork adds a Linux x64 package, find-and-replace with before/after review, independent command IDs, and automated builds and releases. Linux ARM64, Windows and macOS packages are not provided by this fork.

## Install on Linux x64

Install **JetBrains Finder** by **Toximiner** from [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=Toximiner.jetbrains-finder-linux), or run:

```sh
code --install-extension Toximiner.jetbrains-finder-linux
```

The Marketplace identifier remains `Toximiner.jetbrains-finder-linux` so existing installations continue to receive updates.

Alternatively download the Linux VSIX from [GitHub releases](https://github.com/Toximiner/jetbrains-finder-linux/releases) and use **Extensions: Install from VSIX…**. A SHA256 checksum is included with each release.

`Ctrl+Shift+F` opens live search in a separate VS Code window; `Ctrl+Shift+R` opens search with replacement controls in a separate window. Remove an earlier local build under `ziishaned.jetbrains-find-in-files` if both copies compete for these shortcuts.

Search a workspace in a JetBrains-inspired view with live results and a preview of the selected match. Run **JetBrains Finder: Find in Files (New Window)** from the Command Palette to open Finder in its own VS Code window. The regular command and shortcut continue to open it in the current window. On recent versions of VS Code, the view can also open as a floating modal editor over your code.

![Find in Files showing search results and a code preview](https://i.imgur.com/JGqIM4A.png)

## Enable the modal

VS Code controls modal placement. Open **Preferences: Open User Settings (JSON)** and set:

```json
"workbench.editor.useModal": "all"
```

This is a VS Code-wide preference: **other editors may also open as modals**. The extension does not change this setting for you. With `"some"` or `"off"`, Find in Files opens as an editor tab. The modal editor was introduced experimentally in VS Code 1.110; this integration should be used with a recent VS Code release.

## Use

Open a folder or workspace, then press **Cmd+Shift+F** on macOS or **Ctrl+Shift+F** on Windows/Linux. These shortcuts open Finder in a separate VS Code window. You can also run **JetBrains Finder: Find in Files** to open in the current window, or **JetBrains Finder: Find in Files (New Window)** to open in a separate window. A single-line editor selection is used as the initial query.

- Toggle case sensitivity, whole-word matching, and regular expressions beside the search field.
- Search the whole workspace, a workspace folder, or a directory relative to each workspace folder.
- Use the arrow keys to select a result, Enter to open it, and Escape to close the view. Clicking previews; double-clicking opens.
- **Open in Search View** transfers the query and search options to VS Code's built-in search.

## Install and develop

Run `npm install`, then `npm run package` and install the generated `.vsix` using **Extensions: Install from VSIX...** in VS Code. Alternatively open the project in VS Code and press F5 to run an Extension Development Host. Run `npm test` for the search tests.

The default shortcut replaces VS Code's built-in Find in Files shortcut while this extension is enabled. You can change it in Keyboard Shortcuts; the built-in search remains available from the Search view and Command Palette.

## Replace in Files

Press **Ctrl+Shift+R** (or run **JetBrains Finder: Replace in Files**). The shortcut opens a separate VS Code window; the Command Palette command opens in the current window. Enter the query and replacement, then choose **Replace Selected…** or **Replace All…**. Both show a before/after review; **Apply and Save** applies the edits with VS Code's WorkspaceEdit API and saves only the affected files. **Cancel** changes nothing. Empty replacement deletes matches; literal mode preserves `$` characters literally.

Regular-expression replacements support JavaScript substitutions such as `$1`, `$<name>`, `$$` and `$&`. The query must be supported by both ripgrep and JavaScript and agree on the match positions.

Replacement requires a completed, successful search without truncation at the 1,000-match limit. Save unsaved files before searching. Changed documents, files changed on disk after review, and expired previews are rejected before applying edits. Applied text changes support VS Code Undo; save again to persist an Undo.

## Edit directly in the preview

The lower pane is an editable CodeMirror editor as soon as you select a result. Click in the code and type; there is no Edit mode or Save button. Changes save automatically after a 500 ms pause, when focus leaves the pane, and before switching results or closing the search. Closing the tab also flushes the latest draft. Undo is available in the embedded editor and text changes use VS Code's WorkspaceEdit API.

The editor includes line numbers, indentation, bracket matching and syntax highlighting from the active VS Code TextMate theme, installed grammars and token color customizations. Theme switches update the colors without resetting the draft or cursor. Semantic token colors supplied by language servers are not available in this embedded editor. This lightweight editor does not provide Pylance, VS Code extension completions or the full main-editor feature set. Inline editing supports files up to 2 MiB and preserves the file's line endings.

Automatic saving checks the document version and disk contents before applying an edit. If another editor or process changed the file, the draft is retained and an error is shown instead of overwriting the change. Closing the search after such a conflict recovers the draft in an untitled editor. Existing search results are a snapshot; rerun the search after editing to refresh them and enable bulk replacement again.

## Current limitations

The extension uses ripgrep to search files on disk, respects ignore files and boolean `search.exclude` entries, and limits results to the first 1,000 matches. Unsaved edits are shown in the preview but are not included in search results until saved. Search supports file-based workspaces on the local or remote extension host; virtual workspaces are not supported. Directory scopes are approximations of JetBrains scopes; JetBrains modules and named scopes are not available. Open in Search View transfers the query and options, but not the selected workspace folder or directory.


## Releases and upstream

GitHub Actions runs the search, preview and syntax tests, verifies the bundled ripgrep executable, and packages for `linux-x64`. Matching version tags create GitHub releases and publish through Marketplace Trusted Publishing. No publisher token is stored in the repository.

To build locally:

```sh
npm ci
npm test
npm run package
```

Upstream: [ziishaned/jetbrains-finder-for-vscode](https://github.com/ziishaned/jetbrains-finder-for-vscode). Original copyright and license are retained in [LICENSE](LICENSE).
