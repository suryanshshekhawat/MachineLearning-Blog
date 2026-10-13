// Small visit counter, bottom right: "<total> views | <unique> unique".
//
// The site is static (GitHub Pages), so the counts live in a free third-party
// counter service (Abacus). Nothing personal is sent or stored: the service sees
// the visitor's IP address like any web request, and the counts are just two numbers.
//
//   views   = visits: a new tab or session counts once, reloads within it do not
//   unique  = browsers: counted once per browser, using a flag in localStorage
//             (so a cleared browser, private window or second device counts again)
//
// Not counted: local previews, obvious bots, and any browser that has opened the
// site once with ?nocount (remove that again with ?count).
(function () {
  const el = document.getElementById("view-counter");
  if (!el) return;

  const API = "https://abacus.jasoncameron.dev";
  const params = new URLSearchParams(location.search);
  const testNamespace = params.get("counterns"); // testing only: use a scratch namespace and count even on localhost
  const NS = testNamespace || "suryanshshekhawat-blog";

  const host = location.hostname;
  const isLocal = host === "" || host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local");
  const isBot = navigator.webdriver === true || /bot|crawl|spider|slurp|headless|lighthouse/i.test(navigator.userAgent);

  const store = {
    get(area, k) { try { return window[area].getItem(k); } catch { return null; } },
    set(area, k, v) { try { window[area].setItem(k, v); return true; } catch { return false; } },
    del(area, k) { try { window[area].removeItem(k); } catch { /* ignore */ } },
  };

  if (params.has("nocount")) store.set("localStorage", "views:ignore", "1");
  if (params.has("count")) store.del("localStorage", "views:ignore");
  const ignored = store.get("localStorage", "views:ignore") === "1";
  const mayCount = (testNamespace || !isLocal) && !isBot && !ignored;

  async function call(action, key) {
    const res = await fetch(`${API}/${action}/${NS}/${key}`, { cache: "no-store" });
    if (res.status === 404) return 0; // key not created yet: nothing counted so far
    if (!res.ok) throw new Error(`counter ${res.status}`);
    const n = (await res.json()).value;
    if (!Number.isFinite(n)) throw new Error("bad counter value");
    return n;
  }

  async function run() {
    const newSession = store.get("sessionStorage", "views:counted") !== "1";
    const newBrowser = store.get("localStorage", "views:seen") !== "1";
    // Only count a "unique" if we can remember that we did; otherwise every visit would look new.
    const canRemember = store.set("localStorage", "views:probe", "1");
    store.del("localStorage", "views:probe");

    const total = call(mayCount && newSession ? "hit" : "get", "views");
    const unique = call(mayCount && newBrowser && canRemember ? "hit" : "get", "visitors");
    const [t, u] = await Promise.all([total, unique]);

    if (mayCount && newSession) store.set("sessionStorage", "views:counted", "1");
    if (mayCount && newBrowser && canRemember) store.set("localStorage", "views:seen", "1");

    el.textContent = `${t.toLocaleString("en-AU")} ${t === 1 ? "view" : "views"} | ${u.toLocaleString("en-AU")} unique`;
    el.hidden = false;
  }

  run().catch(() => { el.hidden = true; }); // counter service down or blocked: show nothing
})();
