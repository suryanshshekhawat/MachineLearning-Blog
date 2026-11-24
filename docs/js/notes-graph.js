// Graph view for the Notes list: each note is a node, and an arrow runs from
// a note to every note that builds on it (the "buildsOn" field in
// content/notes.json). Nodes are laid out top to bottom in layers, so a note
// always sits below everything it builds on.
//
// When a topic filter hides some notes, links that passed through them are
// kept as dashed arrows between the nearest visible notes.
(function () {
  const CARD_H = 64;
  const GAP_Y = 44;
  const GAP_X = 14;
  const MAX_CARD_W = 300;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Visible edges: [from, to, direct?]. A parent hidden by the filter is
  // replaced by its nearest visible ancestors.
  function buildEdges(items, byId) {
    const shown = new Set(items.map(it => it.id));
    const edges = new Map();
    const add = (from, to, direct) => {
      const key = `${from}>${to}`;
      if (!edges.has(key) || direct) edges.set(key, [from, to, direct]);
    };
    for (const it of items) {
      const seen = new Set();
      const walk = (pid, direct) => {
        if (seen.has(pid) || !byId.has(pid)) return;
        seen.add(pid);
        if (shown.has(pid)) { add(pid, it.id, direct); return; }
        (byId.get(pid).buildsOn || []).forEach(gp => walk(gp, false));
      };
      (it.buildsOn || []).forEach(pid => walk(pid, true));
    }
    return [...edges.values()];
  }

  // Longest-path layering, so every arrow points downwards.
  function layerOf(items, edges) {
    const parents = new Map(items.map(it => [it.id, []]));
    edges.forEach(([from, to]) => parents.get(to).push(from));
    const memo = new Map();
    const depth = (id, stack = new Set()) => {
      if (memo.has(id)) return memo.get(id);
      if (stack.has(id)) return 0; // ignore cycles
      stack.add(id);
      const d = parents.get(id).reduce((m, p) => Math.max(m, depth(p, stack) + 1), 0);
      stack.delete(id);
      memo.set(id, d);
      return d;
    };
    items.forEach(it => depth(it.id));
    return memo;
  }

  function nodeHtml(item, box) {
    const m = /^(.+?):\s*(.*)$/.exec(item.title);
    const kicker = m ? m[1] : "";
    const title = m ? m[2] : item.title;
    return `
      <button type="button" class="graph-node" data-id="${esc(item.id)}" title="${esc(item.title)}"
        style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${CARD_H}px">
        ${Thumbs.html(item)}
        <span class="graph-node-text">${kicker ? `<b>${esc(kicker)}</b> ` : ""}${esc(title)}</span>
      </button>`;
  }

  function layout(container, items, allItems, onOpen) {
    const W = container.clientWidth;
    if (!W) return;
    const byId = new Map(allItems.map(it => [it.id, it]));
    const edges = buildEdges(items, byId);
    const layers = layerOf(items, edges);

    const rows = [];
    items.forEach(it => { const l = layers.get(it.id); (rows[l] = rows[l] || []).push(it); });

    const boxes = new Map();
    rows.forEach((row, l) => {
      const n = row.length;
      const w = Math.min(MAX_CARD_W, (W - GAP_X * (n - 1)) / n);
      const total = w * n + GAP_X * (n - 1);
      row.forEach((it, i) => boxes.set(it.id, { x: Math.round((W - total) / 2 + i * (w + GAP_X)), y: l * (CARD_H + GAP_Y), w: Math.round(w), layer: l }));
    });
    const H = rows.length * (CARD_H + GAP_Y) - GAP_Y;

    const paths = edges.map(([from, to, direct]) => {
      const a = boxes.get(from), b = boxes.get(to);
      const x1 = a.x + a.w / 2, y1 = a.y + CARD_H, x2 = b.x + b.w / 2, y2 = b.y - 6;
      let d;
      if (b.layer - a.layer > 1) {
        // Skips a layer: swing out to the right so it doesn't run behind
        // the cards in between.
        const cx = Math.min(W - 4, Math.max(a.x + a.w, b.x + b.w) + 30);
        d = `M${x1},${y1} C${cx},${y1 + 30} ${cx},${y2 - 30} ${x2},${y2}`;
      } else {
        const my = (y1 + y2) / 2;
        d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
      }
      return `<path class="graph-edge${direct ? "" : " indirect"}" data-from="${esc(from)}" data-to="${esc(to)}" d="${d}" marker-end="url(#graph-arrow)"/>`;
    }).join("");

    container.style.height = `${H}px`;
    container.innerHTML = `
      <svg class="graph-edges" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <defs>
          <marker id="graph-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path class="graph-arrowhead" d="M0,1 L8,5 L0,9 z"/>
          </marker>
          <marker id="graph-arrow-hl" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path class="graph-arrowhead hl" d="M0,1 L8,5 L0,9 z"/>
          </marker>
        </defs>
        ${paths}
      </svg>
      ${items.map(it => nodeHtml(it, boxes.get(it.id))).join("")}`;
    Thumbs.mount(container);

    // Hovering a note highlights its links.
    container.querySelectorAll(".graph-node").forEach(node => {
      const id = node.dataset.id;
      const linked = container.querySelectorAll(`.graph-edge[data-from="${CSS.escape(id)}"], .graph-edge[data-to="${CSS.escape(id)}"]`);
      const mark = on => linked.forEach(p => {
        p.classList.toggle("hl", on);
        p.setAttribute("marker-end", `url(#graph-arrow${on ? "-hl" : ""})`);
      });
      node.addEventListener("mouseenter", () => mark(true));
      node.addEventListener("mouseleave", () => mark(false));
      node.addEventListener("focus", () => mark(true));
      node.addEventListener("blur", () => mark(false));
      node.addEventListener("click", () => onOpen(id));
    });
  }

  // Draw (or redraw) the graph for `items`, a filtered subset of `allItems`.
  function render(container, items, allItems, onOpen) {
    container._graphArgs = [items, allItems, onOpen];
    container._graphW = container.clientWidth;
    layout(container, items, allItems, onOpen);
    if (!container._graphRO && "ResizeObserver" in window) {
      container._graphRO = new ResizeObserver(() => {
        if (!container._graphArgs || container.clientWidth === container._graphW) return;
        container._graphW = container.clientWidth;
        layout(container, ...container._graphArgs);
      });
      container._graphRO.observe(container);
    }
  }

  window.NotesGraph = { render };
})();
