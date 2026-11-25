// List layouts for the Articles / Projects / Notes / Misc sections.
//
// Timeline: one line runs straight down the left side through a node for
// every entry, ending in a dotted "more to come" tail. On wide screens each
// entry is a row (label, tile, title and one-line summary, date); on narrow
// screens the pieces stack.
//
// Cards: a plain grid of cards with a large tile, used where order doesn't
// matter (Misc).
(function () {
  const TAIL = 48;    // dotted tail after the last entry
  const WIDE = 640;   // list width from which timeline entries are rows

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // "2026-08-28" -> "28.08.2026"; anything else is shown as given.
  function formatDate(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
    return m ? `${m[3]}.${m[2]}.${m[1]}` : (d || "");
  }

  // The entry's label: an explicit "label" field, else a short title prefix
  // such as "ML 1: ...", else the date.
  function split(item) {
    const m = /^([^:]{1,12}):\s*(.+)$/.exec(item.title);
    if (item.label) return { label: item.label, title: m ? m[2] : item.title };
    return m ? { label: m[1], title: m[2] } : { label: formatDate(item.date), title: item.title };
  }

  // Small status mark from an item's optional "status" field: a green tick
  // when complete, an orange half-filled circle while still in progress.
  const STATUS = {
    complete: { text: "Complete", icon: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.4 6.6 11.4 12.6 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    incomplete: { text: "In progress", icon: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor"/></svg>' },
  };

  // withText: icon plus a word (used in the graph's side panel); otherwise
  // just the icon, with the word as its tooltip and accessible name.
  function statusHtml(status, withText = true) {
    const s = STATUS[status];
    if (!s) return "";
    return withText
      ? `<span class="status ${status}">${s.icon}${s.text}</span>`
      : `<span class="status ${status}" role="img" aria-label="${s.text}" title="${s.text}">${s.icon}</span>`;
  }

  const statusText = status => (STATUS[status] ? STATUS[status].text : "");

  function popHtml(item, popId) {
    const { label, title } = split(item);
    const date = formatDate(item.date);
    const topics = (item.topics || []).map(t => `<span>${esc(t)}</span>`).join("");
    return `
      <div class="tl-pop" id="${popId}" role="tooltip">
        <span class="tl-pop-meta">${esc(label)}${date && date !== label ? ` &middot; ${esc(date)}` : ""}${item.status ? ` &middot; ${statusText(item.status)}` : ""}</span>
        <span class="tl-pop-title">${title}</span>
        <span class="tl-pop-summary">${item.summary}</span>
        ${topics ? `<span class="tl-pop-topics">${topics}</span>` : ""}
        <span class="tl-pop-hint">Click to open &rarr;</span>
      </div>`;
  }

  // ---- timeline ----

  function itemHtml(item) {
    const { label, title } = split(item);
    const popId = `tl-pop-${esc(item.id)}`;
    const date = formatDate(item.date);
    return `
      <div class="tl-item">
        <span class="tl-node" aria-hidden="true"></span>
        <span class="tl-label">${esc(label)}</span>
        <button type="button" class="tl-card" data-id="${esc(item.id)}" aria-describedby="${popId}">
          ${Thumbs.html(item)}
          <span class="tl-text">
            <span class="tl-title">${title}${item.status ? ` ${statusHtml(item.status, false)}` : ""}</span>
            <span class="tl-summary">${item.summary}</span>
          </span>
        </button>
        <span class="tl-date">${date && date !== label ? esc(date) : ""}</span>
        ${popHtml(item, popId)}
      </div>`;
  }

  // Draw the line from the first node down through the last, plus the tail.
  function drawLine(el) {
    const svg = el.querySelector(".tl-line");
    const box = el.getBoundingClientRect();
    const W = el.clientWidth, H = el.offsetHeight;
    const pts = [...el.querySelectorAll(".tl-node")].map(nd => {
      const r = nd.getBoundingClientRect();
      return [Math.round(r.left + r.width / 2 - box.left), Math.round(r.top + r.height / 2 - box.top)];
    });
    if (!pts.length || !W) { svg.innerHTML = ""; return; }
    const [x0, y0] = pts[0];
    const [x1, y1] = pts[pts.length - 1];
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `<path class="tl-path" d="M${x0},${y0} L${x1},${y1}"/><path class="tl-tail" d="M${x1},${y1} L${x1},${y1 + TAIL}"/>`;
  }

  function layout(el) {
    if (!el.querySelector(".tl-item") || !el.clientWidth) return;
    el.classList.toggle("tl-wide", el.clientWidth >= WIDE);
    drawLine(el);
  }

  function reset(el, kind) {
    el.classList.toggle("timeline", kind === "timeline");
    el.classList.toggle("cards", kind === "cards");
    if (kind !== "timeline") el.classList.remove("tl-wide");
  }

  // Render `items` into `el` as a timeline; onOpen(id) runs when one is clicked.
  function render(el, items, onOpen, emptyText = "Nothing here yet.") {
    reset(el, "timeline");
    if (!items.length) {
      el.innerHTML = `<p class="list-empty">${emptyText}</p>`;
      return;
    }
    el.innerHTML = `<svg class="tl-line" aria-hidden="true"></svg>${items.map(itemHtml).join("")}`;
    Thumbs.mount(el);
    el.querySelectorAll(".tl-card").forEach(btn => btn.addEventListener("click", () => onOpen(btn.dataset.id)));
    layout(el);
    if (!el._tlRO && "ResizeObserver" in window) {
      // Redraw whenever the list changes size (including when a hidden list
      // is shown again). Does nothing when the list is showing cards.
      el._tlRO = new ResizeObserver(() => { if (el.classList.contains("timeline")) layout(el); });
      el._tlRO.observe(el);
    }
  }

  // ---- cards ----

  function cardHtml(item) {
    const { label, title } = split(item);
    const date = formatDate(item.date);
    return `
      <button type="button" class="card" data-id="${esc(item.id)}">
        ${Thumbs.html(item)}
        <span class="card-body">
          <span class="card-top">
            <span class="card-label">${esc(label)}</span>
            ${item.status ? statusHtml(item.status, false) : ""}
            ${date && date !== label ? `<span class="card-date">${esc(date)}</span>` : ""}
          </span>
          <span class="card-title">${title}</span>
          <span class="card-summary">${item.summary}</span>
        </span>
      </button>`;
  }

  function renderCards(el, items, onOpen, emptyText = "Nothing here yet.") {
    reset(el, "cards");
    if (!items.length) {
      el.innerHTML = `<p class="list-empty">${emptyText}</p>`;
      return;
    }
    el.innerHTML = items.map(cardHtml).join("");
    Thumbs.mount(el);
    el.querySelectorAll(".card").forEach(btn => btn.addEventListener("click", () => onOpen(btn.dataset.id)));
  }

  window.Timeline = { render, renderCards, split, formatDate, statusHtml };
})();
