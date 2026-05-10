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

  // 2. Make this the app's frontmost window (z-order within Comet)
  try { win.index = 1; } catch(e) {}

  // 3. Let the tab switch settle so win.title() reflects the new active tab
  delay(0.05);
  let winTitle = "";
  try { winTitle = win.title(); } catch(e) {}

  // 4. Activate — triggers Space switch to the frontmost window's Space.
  //    NOTE: only call activate() once. A second activate() causes Space overshoot.
  browser.activate();

  // 5. Poll-and-raise: the Space transition + Alfred's window dismissal can race
  //    with a single AXRaise. Retry until the matching window is actually
  //    frontmost, or we hit a short deadline.
  const proc = Application("System Events").processes["Comet"];
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    delay(0.08);
    let frontmostMatches = false;
    try {
      const sysWindows = proc.windows();
      for (let i = 0; i < sysWindows.length; i++) {
        try {
          const t = sysWindows[i].title();
          if (winTitle && t.includes(winTitle)) {
            sysWindows[i].actions["AXRaise"].perform();
            break;
          }
        } catch(e2) {}
      }
      // Verify: top window should be ours AND Comet should be frontmost app
      try {
        const topTitle = proc.windows[0].title();
        if (winTitle && topTitle.includes(winTitle) && proc.frontmost()) {
          frontmostMatches = true;
        }
      } catch(e3) {}
    } catch(e) {}
    if (frontmostMatches) break;
  }
}
