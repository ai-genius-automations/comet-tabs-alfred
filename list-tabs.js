#!/usr/bin/env osascript -l JavaScript
// Alfred Script Filter: list open browser tabs.
// Arg: one browser name, or several separated by commas ("Comet,Google Chrome").
// Shared by the Comet (ct), Chrome (gt) and All Tabs (at) workflows.
const BUNDLES = { "Comet": "ai.perplexity.comet", "Google Chrome": "com.google.Chrome" };
const APPS = { "Comet": "/Applications/Comet.app", "Google Chrome": "/Applications/Google Chrome.app" };

const host = url => { const m = url.match(/^\w+:\/\/([^\/?#]+)/); return m ? m[1].replace(/^www\./, "") : url; };
const dupKey = url => url.replace(/#.*$/, "").replace(/\/$/, "");

function run(args) {
  const browsers = (args[0] || "Comet").split(",");
  const multi = browsers.length > 1;
  const tabs = [];
  const notRunning = [];

  for (const name of browsers) {
    const browser = Application(name);
    if (!browser.running()) { notRunning.push(name); continue; }
    browser.windows().forEach((win, w) => {
      let winId, titles, urls, active;
      try {
        winId = win.id();
        titles = win.tabs.title();
        urls = win.tabs.url();
        active = win.activeTabIndex() - 1;
      } catch (e) { return; }
      urls.forEach((url, t) => tabs.push({
        name, winId, t, url: url || "", title: titles[t] || "",
        current: w === 0 && t === active, // front window's selected tab
      }));
    });
  }

  // Only web pages count as duplicates: Comet's Perplexity searches all report chrome://newtab/.
  const counts = {};
  tabs.forEach(tab => { if (/^https?:/.test(tab.url)) { const k = dupKey(tab.url); counts[k] = (counts[k] || 0) + 1; } });

  const items = tabs.map(tab => {
    const n = counts[dupKey(tab.url)] || 1;
    const matchUrl = tab.url.replace(/(^\w+:|^)\/\//, "");
    let decoded = matchUrl;
    try { decoded = decodeURIComponent(matchUrl); } catch (e) {}
    const displayTitle = tab.title || matchUrl || "(untitled)";
    const subtitle = [
      multi ? tab.name : null,
      host(tab.url),
      tab.current ? "● Current tab" : null,
      n > 1 ? `⧉ Open ${n}×` : null,
    ].filter(Boolean).join("  ·  ");
    const arg = `${tab.winId},${tab.t},${tab.url}`;
    const vars = { browser: tab.name, bundle: BUNDLES[tab.name] || "" };
    return {
      title: (n > 1 ? "⧉ " : "") + displayTitle,
      subtitle,
      arg,
      icon: multi && APPS[tab.name] ? { type: "fileicon", path: APPS[tab.name] } : undefined,
      quicklookurl: tab.url,
      text: { copy: tab.url, largetype: displayTitle },
      variables: Object.assign({ action: "focus" }, vars),
      mods: {
        cmd: { subtitle: "Copy URL: " + tab.url, arg, variables: Object.assign({ action: "copy" }, vars) },
        alt: { subtitle: "Close this tab", arg, variables: Object.assign({ action: "close" }, vars) },
      },
      // "ct dup" lists only duplicates; "ct current" finds the tab you're on.
      match: [displayTitle, decoded.replace(/[^\w]/g, " "), n > 1 ? "dup duplicate" : "", tab.current ? "current" : ""].join(" "),
    };
  });

  notRunning.forEach(name => items.push({
    title: `${name} is not running`,
    subtitle: multi ? "Its tabs aren't listed" : `Open ${name} first`,
    valid: false,
  }));
  if (!items.length) items.push({ title: "No tabs open", valid: false });

  // Show the last list instantly; Alfred refreshes it in the background once it's 5s old.
  return JSON.stringify({ cache: { seconds: 5, loosereload: true }, skipknowledge: true, items });
}
