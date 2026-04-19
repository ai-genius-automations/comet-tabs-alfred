#!/usr/bin/env osascript -l JavaScript

function run(args) {
  const browserName = args[0] || "Comet";
  const browser = Application(browserName);
  if (!browser.running()) {
    return JSON.stringify({
      items: [
        {
          title: `${browserName} is not running`,
          subtitle: `Press enter to launch ${browserName}`,
        },
      ],
    });
  }

  const items = [];
  const windows = browser.windows();
  for (let w = 0; w < windows.length; w++) {
    const win = windows[w];
    let tabs;
    try {
      tabs = win.tabs();
    } catch (e) {
      continue;
    }
    for (let t = 0; t < tabs.length; t++) {
      let title = "";
      let url = "";
      try {
        title = tabs[t].title() || "";
      } catch (e) {}
      try {
        url = tabs[t].url() || "";
      } catch (e) {}
      const matchUrl = url.replace(/(^\w+:|^)\/\//, "");
      const displayTitle = title || matchUrl || "(untitled)";
      items.push({
        title: displayTitle,
        url,
        subtitle: url,
        windowIndex: w,
        tabIndex: t,
        quicklookurl: url,
        arg: `${w},${t},${url}`,
        match: `${displayTitle} ${decodeURIComponent(matchUrl).replace(/[^\w]/g, " ")}`,
      });
    }
  }

  return JSON.stringify({ items });
}
