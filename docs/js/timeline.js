// Serial timeline for the Articles / Projects / Notes lists.
//
// Entries sit in a grid, and one continuous line runs through every entry's
// node: left to right along the first row, a rounded U-turn down at the end,
// right to left along the next row, and so on. On narrow screens there is a
// single column and the line simply runs down the left side.
(function () {
  const R = 18;       // radius of the U-turns
  const GUTTER = 12;  // distance of the vertical runs from each side
  const TAIL = 56;    // dotted "more to come" tail after the last entry
  const MIN_COL = 168, COL_GAP = 24, SIDE_PAD = 68; // column sizing

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // As many compact columns as fit (up to five); one column on phones.
  function columnsFor(width) {
    const n = Math.floor((width - SIDE_PAD + COL_GAP) / (MIN_COL + COL_GAP));
    return Math.max(1, Math.min(5, n));
  }

  // "2026-08-28" -> "28.08.2026"; anything else is shown as given.
  function formatDate(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
    return m ? `${m[3]}.${m[2]}.${m[1]}` : (d || "");
  }

  // A short prefix such as "ML 1: ..." becomes the node's label; otherwise
  // the label is the date.
  function split(item) {
    const m = /^([^:]{1,12}):\s*(.+)$/.exec(item.title);
    return m ? { label: m[1], title: m[2] } : { label: formatDate(item.date), title: item.title };
  }

  // Each entry shows just its label, tile and title; the date, summary and
  // topics appear in a card on hover or keyboard focus.
  function itemHtml(item) {
    const { label, title } = split(item);
    const popId = `tl-pop-${esc(item.id)}`;
    const topics = (item.topics || []).map(t => `<span>${esc(t)}</span>`).join("");
    return `
      <div class="tl-item">
        <span class="tl-node" aria-hidden="true"></span>
        <span class="tl-label">${esc(label)}</span>
        <button type="button" class="tl-card" data-id="${esc(item.id)}" aria-describedby="${popId}">
          ${Thumbs.html(item)}
          <span class="tl-title">${title}</span>
        </button>
        <div class="tl-pop" id="${popId}" role="tooltip">
          <span class="tl-pop-meta">${esc(label)} &middot; ${esc(formatDate(item.date))}</span>
          <span class="tl-pop-title">${title}</span>
          <span class="tl-pop-summary">${item.summary}</span>
          ${topics ? `<span class="tl-pop-topics">${topics}</span>` : ""}
          <span class="tl-pop-hint">Click to open &rarr;</span>
        </div>
      </div>`;
  }

  // Place entries so each row continues where the previous one ended.
  function place(el) {
    const width = el.clientWidth;
    if (!width) return 0;
    const n = columnsFor(width);
    el.classList.toggle("tl-vertical", n === 1);
    el.style.gridTemplateColumns = n === 1 ? "" : `repeat(${n}, minmax(0, 1fr))`;
    el.querySelectorAll(".tl-item").forEach((item, i) => {
      const row = Math.floor(i / n), c = i % n;
      item.style.gridRow = n === 1 ? "" : String(row + 1);
      const col = row % 2 === 0 ? c + 1 : n - c;
      item.style.gridColumn = n === 1 ? "" : String(col);
      // Hover cards in the right-hand columns open leftwards so they stay on screen.
      item.classList.toggle("tl-pop-left", n > 1 && col > n / 2 + 0.5);
    });
    return n;
  }

  function drawLine(el, n) {
    const svg = el.querySelector(".tl-line");
    const box = el.getBoundingClientRect();
    const W = el.clientWidth, H = el.offsetHeight;
    const pts = [...el.querySelectorAll(".tl-node")].map(nd => {
      const r = nd.getBoundingClientRect();
      return [Math.round(r.left + r.width / 2 - box.left), Math.round(r.top + r.height / 2 - box.top)];
    });
    if (!pts.length || !W) { svg.innerHTML = ""; return; }

    let d = `M${pts[0][0]},${pts[0][1]}`;
    let tail = "";
    if (n === 1) {
      const [x, y] = pts[pts.length - 1];
      d += ` L${x},${y}`;
      tail = `M${x},${y} L${x},${y + TAIL}`;
    } else {
      const xL = GUTTER, xR = W - GUTTER;
      const rows = [];
      pts.forEach((p, i) => { const r = Math.floor(i / n); (rows[r] = rows[r] || []).push(p); });
      rows.forEach((row, r) => {
        const y = row[0][1];
        const rightward = r % 2 === 0;
        if (r < rows.length - 1) {
          const ny = rows[r + 1][0][1];
          d += rightward
            ? ` L${xR - R},${y} A${R},${R} 0 0 1 ${xR},${y + R} L${xR},${ny - R} A${R},${R} 0 0 1 ${xR - R},${ny}`
            : ` L${xL + R},${y} A${R},${R} 0 0 0 ${xL},${y + R} L${xL},${ny - R} A${R},${R} 0 0 0 ${xL + R},${ny}`;
        } else {
          const [x] = row[row.length - 1];
          d += ` L${x},${y}`;
          const tx = rightward ? Math.min(xR, x + TAIL) : Math.max(xL, x - TAIL);
          tail = `M${x},${y} L${tx},${y}`;
        }
      });
    }
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `<path class="tl-path" d="${d}"/>${tail ? `<path class="tl-tail" d="${tail}"/>` : ""}`;
  }

  function layout(el) {
    const n = place(el);
    if (n) drawLine(el, n);
  }

  // Render `items` into `el` as a timeline; onOpen(id) runs when one is clicked.
  function render(el, items, onOpen) {
    el.classList.add("timeline");
    el.innerHTML = `<svg class="tl-line" aria-hidden="true"></svg>${items.map(itemHtml).join("")}`;
    Thumbs.mount(el);
    el.querySelectorAll(".tl-card").forEach(btn => btn.addEventListener("click", () => onOpen(btn.dataset.id)));
    layout(el);
    if (!el._tlRO && "ResizeObserver" in window) {
      // Re-place and redraw whenever the list changes size (including when a
      // hidden list is shown again).
      el._tlRO = new ResizeObserver(() => layout(el));
      el._tlRO.observe(el);
    }
  }

  window.Timeline = { render };
})();
