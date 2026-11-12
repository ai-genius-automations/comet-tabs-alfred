# Browser Tabs — Alfred Workflows (Comet `ct`, Chrome `gt`, both `at`)

| Keyword | Searches | Alfred folder |
|---|---|---|
| `ct` | Comet | `user.workflow.C0ME7TAB-0000-4000-8000-000000000001` (this repo) |
| `gt` | Google Chrome | `user.workflow.CHR0ME7B-…` → symlink to `variants/chrome` |
| `at` | Comet + Chrome (each row names its browser) | `user.workflow.A11TAB5X-…` → symlink to `variants/all` |

## What it does

Type the keyword, a space and a search term to fuzzy-search open tabs in every window.

| Key | Action |
|---|---|
| ↩ | Select the tab and bring its window forward, switching desktops (Spaces) if needed |
| ⌘↩ | Copy the tab's URL (⌘C works too) |
| ⌥↩ | Close the tab |
| ⇧ | Quick Look preview · ⌘L shows the title in large type |

In the results:
- **⧉ Open N×** means the same web page is open in more than one tab. Only http(s) URLs count, ignoring `#…` and a trailing `/`. Comet's Perplexity searches all report `chrome://newtab/`, so they're excluded.
- **● Current tab** marks the selected tab of the front window.
- Searching `ct dup` lists only duplicates, and `ct current` finds the tab you're on.
- The subtitle shows the site's domain instead of the full URL. Searching still matches the whole URL.

## Layout: one copy of the code

```
list-tabs.js        Script Filter; arg = browser name(s): "Comet", "Google Chrome", "Comet,Google Chrome"
focus-tab.js        Action; env vars browser / bundle / action (focus|copy|close) come from each result
raise-window.swift  Helper that raises a window on any Space (binary `raise-window` is gitignored)
info.plist          ct workflow
variants/chrome/    gt: its own info.plist plus symlinks to the three files above
variants/all/       at: same
```

The `gt` and `at` folders in Alfred's workflows directory are symlinks to the `variants/` folders. Fix a bug once, here, and all three keywords get it. After a fresh clone, rebuild the helper and recreate the symlinks (paths relative to the workflows folder):

```
swiftc -O raise-window.swift -o raise-window -F /System/Library/PrivateFrameworks -framework SkyLight
cd .. && ln -s user.workflow.C0ME7TAB-0000-4000-8000-000000000001/variants/chrome user.workflow.CHR0ME7B-0000-4000-8000-000000000001
ln -s user.workflow.C0ME7TAB-0000-4000-8000-000000000001/variants/all user.workflow.A11TAB5X-0000-4000-8000-000000000001
```

Alfred may not notice that a folder was replaced. If a keyword doesn't show up, run `osascript -e 'tell application id "com.runningwithcrayons.Alfred" to reload workflow "com.noahriley.chrome-tabs"'` (or `….all-tabs`).

Log: `/tmp/browser-tabs-focus.log`, one line per action. Failures also show a macOS notification.

## How we got here — errors and iterations

### Session 1: Adding Comet to the existing browser-tabs workflow

The original plan was to add Comet as another browser in the existing Epilande "Browser Tabs" workflow (`user.workflow.555B7B8E-...`), alongside Chrome, Arc, Safari, etc.

1. **First attempt: reuse `list-tabs.js`** — The shared tab enumerator uses a batch accessor (`chrome.windows.tabs.title()`) which took **61 seconds** on Comet vs <1s on Chrome. Comet's AppleScript bridge handles the batch accessor poorly.

2. **Fix: wrote `list-tabs-comet.js`** — Per-tab iteration (`windows[w].tabs[t].title()`) runs in **0.5 seconds**. 122x speedup.

3. **Edited `info.plist` with Python's `plistlib`** — Added Script Filter node (keyword `ct`), utility.argument node (sets `browser=Comet`), connections, and uidata. This worked. Made backup at `info.plist.bak-20260416-032806`.

### Session 2: Cross-desktop focus (this session)

The user wanted `ct` to work across macOS Spaces/desktops — find a tab on any desktop, switch to that desktop, and raise the window.

4. **Wrote `focus-tab-comet.js`** — Uses `win.index = 1` to make the target window frontmost in the app's window ordering, then `browser.activate()` to trigger a Space switch (requires "When switching to an application, switch to a Space with open windows" in System Settings).

5. **Modified `info.plist` with `plistlib.dump()`** — Added a new Run Script node and rewired the Comet flow. **This broke everything.** `ct` stopped showing results entirely.

6. **Root cause: `plistlib` rewrites the entire file.** Even though the content was byte-for-byte identical for existing nodes and the XML format looked identical under `od -c` inspection, Alfred refused to load the workflow after a full `plistlib` roundtrip. The exact reason is unclear — possibly a subtle encoding/BOM/ordering difference that `plistlib` introduces.

7. **Failed fix attempts:**
   - Restored backup + re-added nodes via `plistlib` → same broken behavior
   - Restored backup + used `plutil -convert json` → modify JSON → `plutil -convert xml1` → Alfred said "incompatible workflow"
   - Restored backup + used `/usr/libexec/PlistBuddy` → couldn't add `version` keys, partial corruption
   - Restored backup + injected raw XML via Python `lines.insert()` → plutil validated OK, but Alfred said "incompatible workflow"
   - Restored backup + injected via `sed` → macOS `sed` doesn't interpret `\t` as tab in `a` commands, produced literal `tt` instead of tabs → invalid XML

8. **What finally worked: standalone workflow cloned from a known-working plist.**
   - Restored `info.plist.bak-20260416-032806` to fix the browser-tabs workflow (`t` keyword works again)
   - Created a new workflow directory: `user.workflow.C0ME7TAB-0000-4000-8000-000000000001`
   - Copied `list-tabs-comet.js` and `focus-tab-comet.js` into it
   - Copied the working `wifi-diag` workflow's `info.plist` as a template
   - Used Python string replacement to change only names/keywords/scripts/UIDs
   - This produced a plist that Alfred accepted

9. **Post-clone fixes (inherited wifi-diag settings):**
   - `withspace: false → true` — wifi doesn't take a search argument; Comet needs space to type a query
   - `argumenttype: 2 → 1` — 2 = no argument, 1 = optional argument
   - `argumenttreatemptyqueryasnil: true → false` — must run script even with no query to show all tabs
   - `alfredfiltersresultsmatchmode: 2 → 0` — different fuzzy match mode
   - Replaced clipboard output node with `alfred.workflow.action.script` node calling `focus-tab-comet.js`
   - **Critical: `alfred.workflow.action.script` version must be `2`, not `3`** — version 3 triggers "incompatible workflow" on Alfred 5.7.3. The working browser-tabs workflow uses version 2 for this node type. This was the final fix.

## Key lessons

1. **Never use `plistlib.dump()` to rewrite an Alfred workflow plist.** Even if the content is identical, the full rewrite breaks Alfred's ability to load the workflow. Cause unknown.

2. **Don't inject XML into Alfred plists either.** Multiple approaches (PlistBuddy, sed, Python text insertion, plutil JSON roundtrip) all produced plists that Alfred rejected as "incompatible" even when `plutil -lint` said they were valid.

3. **The safe way to create Alfred workflows programmatically:** Copy an existing working plist from another workflow and do minimal string replacements. Don't add/remove/restructure nodes — just change values.

4. **Alfred node `version` fields matter.** The `version` key on each node object refers to the schema version of that node type, NOT the workflow version. Using a version number higher than what your Alfred supports triggers the "incompatible" error. Check existing working workflows for the correct version numbers:
   - `alfred.workflow.input.scriptfilter` → version 3 (Alfred 5.7.3)
   - `alfred.workflow.action.script` → version **2** (NOT 3)
   - `alfred.workflow.output.clipboard` → version 3

5. **Comet's AppleScript bridge is slow for batch accessors.** Always use per-tab iteration, not `windows.tabs.title()`.

6. **macOS `sed -i ''` doesn't interpret `\t`** in append (`a`) commands. Use Python or actual tab characters.

## Files

- `info.plist` — Workflow definition (Script Filter → Run Script)
- `list-tabs-comet.js` — JXA tab enumerator (per-tab iteration, ~0.5s)
- `focus-tab-comet.js` — JXA tab focus script (cross-desktop via index=1 + AXRaise)
- `README.md` — This file

## Cross-desktop focus — tuning iterations

10. **First version: single `activate()` + 0.15s delay + `AXRaise`** — Worked on the current desktop but didn't switch Spaces at all. Had to select the tab twice.

11. **Second version: double `activate()` with 0.4s gap** — Switched to the correct Space on the first `activate()`, but the second `activate()` triggered *another* Space switch, overshooting by one desktop.

12. **Final version: single `activate()` + 0.5s delay + title-match `AXRaise`** — One `activate()` switches to the correct Space, the 0.5s delay lets the Space transition animation finish, then `AXRaise` (matched by window title via System Events) raises the correct window. Works reliably in one selection.

13. **It wasn't actually reliable.** The `/tmp/comet-focus.log` from the instrumented build (Oct 29 – Nov 12) showed `raised=false` in about 60% of runs. Two causes:
   - **Index drift.** JXA specifiers are lazy, so `browser.windows[13]` is re-resolved on every call. After `win.index = 1` reorders the windows, `windows[13]` is a *different* window. The log showed the title read as one window's name, then "settle" to a completely different window's name, so the script then hunted for the wrong title.
   - **System Events only lists windows on the current Space.** That was 5 of 15 Comet windows. A window on another Space is never found, and `activate()` goes to Comet's most recent window by the window server's ordering. Chromium's `win.index = 1` doesn't change that ordering.

### Current version (2026-11-12)

- `list-tabs-comet.js` passes Comet's stable **window id** (`win.id()`), not the list position. The arg is now `windowId,tabIndex,url`.
- `focus-tab-comet.js`:
  - resolves the window with `windows.byId()`;
  - re-finds the tab by URL if it moved, then selects it;
  - reads the tab's title and the window's bounds;
  - calls `./raise-window`.
- `raise-window` is a compiled Swift helper; its source is `raise-window.swift`. It uses the same private APIs as AltTab:
  - It tries the current Space's AX windows first. If the window isn't there, it builds AX elements for every window with `_AXUIElementCreateWithRemoteToken` (brute-forcing element ids 0…200k, stopping at the first title+bounds match; Comet's ids were up to about 15k). This reaches windows on any Space.
  - `_SLPSSetFrontProcessWithOptions(psn, windowId, kCPSUserGenerated)` plus two `SLPSPostEventRecordTo` key-window events. This is what actually switches to that window's Space. `AXRaise` + `activate()` alone brought up the wrong window.
  - Then it sets `AXMain` and runs `AXRaise`.
  - Bounds break ties between windows with the same title.
- Tested on three windows on three different Spaces: all came up on the first try, in 0.2–0.9s. The old version took 2.5–3.6s.

### Same day, round two: improvements

- **Exact window, even with identical titles.** `focus-tab.js` temporarily sets the window's `givenName` to a unique tag (`alfred-tab-<ms>`), then restores it. Both Chrome and Comet support this in AppleScript ("Name window…"), and the AX title changes right away. `raise-window` now takes `<bundle-id> <title>` and matches the tag, so the size/position tie-breaking is gone. Tested on two windows with identical titles: each came up correctly.
- **Faster hidden-window search.** `raise-window` caches the AX element ids where windows were found in `~/Library/Caches/com.noahriley.browser-tabs/<bundle>-<pid>.ids`. It checks those first and skips them in the full scan. The first run after launching the browser took about 1.5s; later runs take about 0.25s.
- **Instant list.** Script Filter JSON `cache: {seconds: 5, loosereload: true}` (Alfred 5.5+). Alfred shows the last list immediately and reruns the script in the background. The focus action re-finds the tab by URL, so a list that's a few seconds old is harmless.
- `list-tabs.js` reads tabs one window at a time (`win.tabs.title()`). That's fine on Comet: about 1.0s for 48 tabs vs 1.2s per-tab. Only the all-windows accessor `windows.tabs.title()` was the 61s problem.
- **Modifier connections in `info.plist`.** ⌘ (1048576) and ⌥ (524288) were added by duplicating the existing connection `<dict>` text exactly and changing only `modifiers`/`modifiersubtext`. Alfred loaded it fine, confirmed by a screenshot of ⌥ showing "Close this tab". (Lesson 2 above was likely really the node-`version` problem from lesson 4, not text editing as such.)

### Known limits

- These are private macOS APIs. If a macOS update breaks them, the helper prints `not-found` and you get a "Couldn't bring that window forward" notification. Check `/tmp/browser-tabs-focus.log`.
- If you've named a window yourself (Window → Name Window), the name is restored after the brief retag, but it flickers for a moment.
- The ● Current tab marker and duplicate counts can be up to about 5 seconds out of date, because of the cache.
