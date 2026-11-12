#!/usr/bin/env osascript -l JavaScript
// Alfred action for a tab picked in list-tabs.js.
// Input: "windowId,tabIndex,url". Env (set per item by list-tabs.js):
//   browser = app name, bundle = bundle id, action = focus | copy | close
// focus: selects the tab, briefly renames its window to a unique tag so ./raise-window can
// find exactly that window (even on another Space, even if another window has the same
// title), raises it, then restores the window's name.
ObjC.import('Foundation');
const LOG = '/tmp/browser-tabs-focus.log';
function log(msg) {
  try {
    const line = (new Date()).toISOString() + '  ' + msg + '\n';
    const path = $(LOG);
    const data = $.NSString.alloc.initWithUTF8String(line).dataUsingEncoding($.NSUTF8StringEncoding);
    if (!$.NSFileManager.defaultManager.fileExistsAtPath(path)) data.writeToFileAtomically(path, true);
    else { const fh = $.NSFileHandle.fileHandleForWritingAtPath(path); fh.seekToEndOfFile; fh.writeData(data); fh.closeFile; }
  } catch (e) {}
}
const env = $.NSProcessInfo.processInfo.environment;
const envVar = (k, d) => { const v = env.objectForKey(k); return v.isNil() ? d : ObjC.unwrap(v); };
const sh = s => "'" + String(s).replace(/'/g, "'\\''") + "'";

function run(args) {
  const t0 = Date.now();
  const browserName = envVar('browser', 'Comet');
  const bundle = envVar('bundle', 'ai.perplexity.comet');
  const action = envVar('action', 'focus');
  const query = args[0];
  const [winId, tabIndex] = query.split(",").map(x => parseInt(x));
  const url = query.split(",").slice(2).join(",");

  const self = Application.currentApplication();
  self.includeStandardAdditions = true;
  const notify = msg => { try { self.displayNotification(msg, { withTitle: browserName + ' Tabs' }); } catch (e) {} };

  if (action === 'copy') { self.setTheClipboardTo(url); notify('Copied ' + url); return; }

  const browser = Application(browserName);
  const win = browser.windows.byId(winId);

  // Find the tab, by URL if it moved or its window is gone since the list was built.
  let t = -1, w = win;
  try { if (win.tabs[tabIndex].url() === url) t = tabIndex; else t = win.tabs.url().indexOf(url); } catch (e) {}
  if (t < 0) {
    for (const other of browser.windows()) {
      let i = -1; try { i = other.tabs.url().indexOf(url); } catch (e) {}
      if (i >= 0) { w = other; t = i; break; }
    }
  }
  if (t < 0) { notify("That tab isn't open anymore"); log(`${browserName} ${action} gone ${url}`); return; }

  if (action === 'close') { w.tabs[t].close(); log(`${browserName} closed ${url}`); return; }

  w.activeTabIndex = t + 1;
  let given = ""; try { given = w.givenName() || ""; } catch (e) {}
  const tag = 'alfred-tab-' + Date.now();
  let out = "";
  try {
    w.givenName = tag;
    const helper = $.NSFileManager.defaultManager.currentDirectoryPath.js + '/raise-window';
    out = self.doShellScript([helper, bundle, tag].map(sh).join(' '));
  } catch (e) { out = 'error ' + e; }
  try { w.givenName = given; } catch (e) {}
  if (!out.startsWith('raised')) notify("Couldn't bring that window forward: " + out);
  log(`${browserName} win=${w.id()} tab=${t} -> ${out} ${Date.now() - t0}ms`);
}
