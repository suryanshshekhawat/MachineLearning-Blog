// Light / dark theme. Loaded in <head> so the saved choice applies before
// first paint. Light is the default; dark only when the visitor picks it.
(function () {
  const root = document.documentElement;
  const listeners = [];

  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) { /* storage blocked */ }
  if (saved === "dark" || saved === "light") root.dataset.theme = saved;

  function current() {
    return root.dataset.theme === "dark" ? "dark" : "light";
  }

  function notify() {
    const theme = current();
    listeners.forEach(fn => fn(theme));
  }

  function set(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch (e) { /* storage blocked */ }
    notify();
  }

  const ICONS = {
    // Shown in light mode: switch to dark.
    dark: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    // Shown in dark mode: switch to light.
    light: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  };

  function syncButton(btn) {
    const next = current() === "dark" ? "light" : "dark";
    btn.innerHTML = ICONS[next];
    btn.setAttribute("aria-label", `Switch to ${next} theme`);
    btn.title = `Switch to ${next} theme`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    syncButton(btn);
    btn.addEventListener("click", () => set(current() === "dark" ? "light" : "dark"));
    listeners.push(() => syncButton(btn));
  });

  window.siteTheme = { current, set, onChange: fn => listeners.push(fn) };
})();
