// Serial timeline for the Articles / Projects / Notes lists.
//
// One line runs straight down the left side through a node for every entry,
// ending in a dotted "more to come" tail. On wide screens each entry is a
// compact row (status, label, tile and title, date); on narrow screens the
// same pieces stack.
(function () {
  const TAIL = 48;    // dotted tail after the last entry
  const WIDE = 640;   // list width from which entries are laid out as rows

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // "2026-08-28" -> "28.08.2026"; anything else is shown as given.
  function formatDate(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
    return m ? `${m[3]}.${m[2]}.${m[1]}` : (d || "");
  }

  // The node's label: an explicit "label" field, else a short title prefix
  // such as "ML 1: ...", else the date.
  function split(item) {
    const m = /^([^:]{1,12}):\s*(.+)$/.exec(item.title);
    if (item.label) return { label: item.label, title: m ? m[2] : item.title };
    return m ? { label: m[1], title: m[2] } : { label: formatDate(item.date), title: item.title };
  }

  // "complete" / "incomplete" badge from an item's optional "status" field.
  const STATUS = {
    complete: { text: "Complete", icon: '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    incomplete: { text: "Incomplete", icon: '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 1.8a4.2 4.2 0 0 1 0 8.4z" fill="currentColor"/></svg>' },
  };
  function statusHtml(status, extra = "") {
    const s = STATUS[status];
    return s ? `<span class="status-tag ${status}${extra}">${s.icon}${s.text}</span>` : "";
  }

  // Each entry shows its status, label, tile, title and date; the summary
  // and topics appear in a card on hover or keyboard focus.
  function itemHtml(item, withStatus) {
    const { label, title } = split(item);
    const popId = `tl-pop-${esc(item.id)}`;
    const topics = (item.topics || []).map(t => `<span>${esc(t)}</span>`).join("");
    const date = formatDate(item.date);
    // Every entry gets a status slot when any entry has one, so the columns
    // line up.
    const status = withStatus ? (statusHtml(item.status) || '<span class="status-tag none" aria-hidden="true">&nbsp;</span>') : "";
    return `
      <div class="tl-item${item.status ? ` is-${esc(item.status)}` : ""}">
        <span class="tl-node" aria-hidden="true"></span>
        ${status}
        <span class="tl-label">${esc(label)}</span>
        <button type="button" class="tl-card" data-id="${esc(item.id)}" aria-describedby="${popId}">
          ${Thumbs.html(item)}
          <span class="tl-title">${title}</span>
        </button>
        <span class="tl-date">${date && date !== label ? esc(date) : ""}</span>
        <div class="tl-pop" id="${popId}" role="tooltip">
          <span class="tl-pop-meta">${esc(label)}${date && date !== label ? ` &middot; ${esc(date)}` : ""}${item.status ? ` &middot; ${STATUS[item.status] ? STATUS[item.status].text : esc(item.status)}` : ""}</span>
          <span class="tl-pop-title">${title}</span>
          <span class="tl-pop-summary">${item.summary}</span>
          ${topics ? `<span class="tl-pop-topics">${topics}</span>` : ""}
          <span class="tl-pop-hint">Click to open &rarr;</span>
        </div>
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

  // Render `items` into `el` as a timeline; onOpen(id) runs when one is clicked.
  function render(el, items, onOpen, emptyText = "Nothing here yet.") {
    el.classList.add("timeline");
    if (!items.length) {
      el.innerHTML = `<p class="list-empty">${emptyText}</p>`;
      return;
    }
    const withStatus = items.some(it => it.status);
    el.classList.toggle("tl-has-status", withStatus);
    el.innerHTML = `<svg class="tl-line" aria-hidden="true"></svg>${items.map(it => itemHtml(it, withStatus)).join("")}`;
    Thumbs.mount(el);
    el.querySelectorAll(".tl-card").forEach(btn => btn.addEventListener("click", () => onOpen(btn.dataset.id)));
    layout(el);
    if (!el._tlRO && "ResizeObserver" in window) {
      // Redraw whenever the list changes size (including when a hidden list
      // is shown again).
      el._tlRO = new ResizeObserver(() => layout(el));
      el._tlRO.observe(el);
    }
  }

  window.Timeline = { render, split, formatDate, statusHtml };
})();
