#!/usr/bin/env osascript -l JavaScript
// Focus a Comet tab across macOS Spaces/desktops.
// Input: "windowIndex,tabIndex,url"
function run(args) {
  const query = args[0];
  const [windowIndex, tabIndex] = query.split(",").map(x => parseInt(x));

  const browser = Application("Comet");
  const win = browser.windows[windowIndex];

  // 1. Switch to the target tab
  win.activeTabIndex = tabIndex + 1;

  // 2. Make this the app's frontmost window
  try { win.index = 1; } catch(e) {}

  // 3. Activate — triggers Space switch to the frontmost window's Space
  browser.activate();

  // 4. Wait for Space transition animation to finish
  delay(0.5);

  // 5. Raise the correct window via System Events (title match)
  try {
    const winTitle = win.title();
    const proc = Application("System Events").processes["Comet"];
    const sysWindows = proc.windows();
    for (let i = 0; i < sysWindows.length; i++) {
      try {
        if (sysWindows[i].title().includes(winTitle)) {
          sysWindows[i].actions["AXRaise"].perform();
          break;
        }
      } catch(e2) {}
    }
  } catch(e) {}
}
