// Graph view for the Notes list: each note is a node, and an arrow runs from
// a note to every note that builds on it (the "buildsOn" field in
// content/notes.json). Nodes are laid out top to bottom in layers, so a note
// always sits below everything it builds on.
//
// Exploring: hovering a note lights up its whole chain (what it builds on and
// what follows from it) and previews it in the side panel. Clicking selects
// it; the panel then links to the notes before and after it. Arrow keys walk
// the graph (up = builds on, down = leads to, left/right = same level) and
// Enter opens the note.
//
// When a topic filter hides some notes, links that passed through them are
// kept as dashed arrows between the nearest visible notes.
(function () {
  const NODE_H = 52;
  const GAP_Y = 40;
  const GAP_X = 14;
  const MAX_NODE_W = 196;
  const MIN_NODE_W = 150;   // levels wider than this wrap onto extra rows
  const GROUP_HEAD = 34;    // height of a branch heading
  const GROUP_GAP = 30;     // space between branches

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Label, date and status helpers are shared with the timeline.
  const { split, formatDate, statusHtml } = window.Timeline;

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
  function layerOf(items, parents) {
    const memo = new Map();
    const depth = (id, stack = new Set()) => {
      if (memo.has(id)) return memo.get(id);
      if (stack.has(id)) return 0; // ignore cycles
      stack.add(id);
      const d = (parents.get(id) || []).reduce((m, p) => Math.max(m, depth(p, stack) + 1), 0);
      stack.delete(id);
      memo.set(id, d);
      return d;
    };
    items.forEach(it => depth(it.id));
    return memo;
  }

  function closure(start, next) {
    const out = new Set();
    const walk = id => (next.get(id) || []).forEach(n => { if (!out.has(n)) { out.add(n); walk(n); } });
    walk(start);
    return out;
  }

  function render(container, items, allItems, onOpen, emptyText = "Nothing here yet.") {
    // Keep the selection across re-renders (filter changes, resizes).
    const prevSelected = container._graph && container._graph.selected;
    if (container._graphRO) container._graphRO.disconnect();
    if (!items.length) {
      container._graph = null;
      container.innerHTML = `<p class="list-empty">${emptyText}</p>`;
      return;
    }

    const byId = new Map(allItems.map(it => [it.id, it]));
    const edges = buildEdges(items, byId);
    const parents = new Map(items.map(it => [it.id, []]));
    const children = new Map(items.map(it => [it.id, []]));
    edges.forEach(([f, t]) => { parents.get(t).push(f); children.get(f).push(t); });
    const layers = layerOf(items, parents);

    container.innerHTML = `
      <div class="graph-wrap">
        <div class="graph-canvas"></div>
        <aside class="graph-panel" aria-live="polite"></aside>
      </div>`;
    const canvas = container.querySelector(".graph-canvas");
    const panel = container.querySelector(".graph-panel");
    const state = { selected: items.some(it => it.id === prevSelected) ? prevSelected : null, hovered: null, boxes: new Map() };
    container._graph = state;

    // Each branch (an item's first topic) gets its own block with a heading;
    // inside it, notes sit in levels, and a level wider than the canvas wraps
    // onto extra rows.
    const groups = [];
    items.forEach(it => {
      const name = (it.topics || [])[0] || "";
      let g = groups.find(x => x.name === name);
      if (!g) groups.push(g = { name, items: [] });
      g.items.push(it);
    });

    function layout() {
      const W = canvas.clientWidth;
      if (!W) return;
      const perRow = Math.max(1, Math.floor((W + GAP_X) / (MIN_NODE_W + GAP_X)));
      state.boxes = new Map();
      const heads = [];
      let y = 0, row = 0;
      groups.forEach((g, gi) => {
        if (gi) y += GROUP_GAP;
        const done = g.items.filter(it => it.status === "complete").length;
        const withStatus = g.items.filter(it => it.status).length;
        heads.push(`<div class="graph-group" style="top:${y}px">${esc(g.name || "Other")}<span>${g.items.length} ${g.items.length === 1 ? "note" : "notes"}${withStatus ? ` &middot; ${done} complete` : ""}</span></div>`);
        y += GROUP_HEAD;
        const levels = [...new Set(g.items.map(it => layers.get(it.id)))].sort((a, b) => a - b);
        levels.forEach(l => {
          const level = g.items.filter(it => layers.get(it.id) === l);
          for (let i = 0; i < level.length; i += perRow) {
            const chunk = level.slice(i, i + perRow);
            const n = chunk.length;
            const w = Math.min(MAX_NODE_W, (W - GAP_X * (n - 1)) / n);
            const total = w * n + GAP_X * (n - 1);
            chunk.forEach((it, j) => state.boxes.set(it.id, { x: Math.round((W - total) / 2 + j * (w + GAP_X)), y, w: Math.round(w), row }));
            y += NODE_H + GAP_Y;
            row++;
          }
        });
        y -= GAP_Y;
      });
      const H = y;

      const paths = edges.map(([from, to, direct]) => {
        const a = state.boxes.get(from), b = state.boxes.get(to);
        const x1 = a.x + a.w / 2, y1 = a.y + NODE_H, x2 = b.x + b.w / 2, y2 = b.y - 6;
        let d;
        if (b.row - a.row > 1) {
          // Skips a level: swing out to the right so it doesn't run behind
          // the nodes in between.
          const cx = Math.min(W - 4, Math.max(a.x + a.w, b.x + b.w) + 30);
          d = `M${x1},${y1} C${cx},${y1 + 30} ${cx},${y2 - 30} ${x2},${y2}`;
        } else {
          const my = (y1 + y2) / 2;
          d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
        }
        return `<path class="graph-edge${direct ? "" : " indirect"}" data-from="${esc(from)}" data-to="${esc(to)}" d="${d}" marker-end="url(#graph-arrow)"/>`;
      }).join("");

      canvas.style.height = `${H}px`;
      canvas.innerHTML = `
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
        ${heads.join("")}
        ${items.map(it => {
          const box = state.boxes.get(it.id);
          const { label, title } = split(it);
          const status = it.status ? `<span class="graph-status ${esc(it.status)}" aria-hidden="true"></span>` : "";
          return `
            <button type="button" class="graph-node${it.status ? ` is-${esc(it.status)}` : ""}" data-id="${esc(it.id)}"
              aria-label="${esc(it.title)}${it.status ? ` (${esc(it.status)})` : ""}"
              style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${NODE_H}px">
              ${Thumbs.html(it)}
              <span class="graph-node-text">${label ? `<b>${esc(label)}</b>` : ""}<span>${esc(title)}</span></span>
              ${status}
            </button>`;
        }).join("")}`;
      Thumbs.mount(canvas);
      paint();
    }

    // Highlight the chain through the hovered (or else selected) note and
    // show it in the panel.
    function paint() {
      const focus = state.hovered || state.selected;
      let onChain = null, up = null, down = null;
      if (focus) {
        up = closure(focus, parents); up.add(focus);
        down = closure(focus, children); down.add(focus);
        onChain = new Set([...up, ...down]);
      }
      canvas.querySelectorAll(".graph-node").forEach(node => {
        const id = node.dataset.id;
        node.classList.toggle("selected", id === state.selected);
        node.classList.toggle("dim", !!focus && !onChain.has(id));
        node.setAttribute("aria-pressed", String(id === state.selected));
      });
      canvas.querySelectorAll(".graph-edge").forEach(p => {
        const f = p.dataset.from, t = p.dataset.to;
        const hl = !!focus && ((up.has(f) && up.has(t)) || (down.has(f) && down.has(t)));
        p.classList.toggle("hl", hl);
        p.classList.toggle("dim", !!focus && !hl);
        p.setAttribute("marker-end", `url(#graph-arrow${hl ? "-hl" : ""})`);
      });
      renderPanel(focus);
    }

    function chip(id) {
      const it = byId.get(id);
      const { label, title } = split(it);
      return `<button type="button" class="gp-chip" data-go="${esc(id)}" title="${esc(it.title)}">${esc(label || title)}</button>`;
    }

    function renderPanel(id) {
      if (!id) {
        panel.innerHTML = `
          <p class="gp-empty-title">Explore the notes</p>
          <p class="gp-empty">Hover a note to see the path through it; click one to pin it here.</p>
          <ul class="gp-keys">
            <li><kbd>&uarr;</kbd> builds on</li>
            <li><kbd>&darr;</kbd> leads to</li>
            <li><kbd>&larr;</kbd><kbd>&rarr;</kbd> same level</li>
            <li><kbd>Enter</kbd> open</li>
          </ul>`;
        return;
      }
      const it = byId.get(id);
      const { label, title } = split(it);
      const date = formatDate(it.date);
      const before = parents.get(id) || [];
      const after = children.get(id) || [];
      panel.innerHTML = `
        <p class="gp-kicker">${esc(label)}${date && date !== label ? ` &middot; ${esc(date)}` : ""}</p>
        <h3 class="gp-title">${esc(title)}</h3>
        ${it.status ? `<div>${statusHtml(it.status)}</div>` : ""}
        ${(it.topics || []).length ? `<div class="gp-topics">${it.topics.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
        <p class="gp-summary">${it.summary}</p>
        <div class="gp-links"><span class="gp-links-label">Builds on</span>${before.length ? before.map(chip).join("") : `<span class="gp-none">a starting point</span>`}</div>
        <div class="gp-links"><span class="gp-links-label">Leads to</span>${after.length ? after.map(chip).join("") : `<span class="gp-none">nothing yet</span>`}</div>
        <button type="button" class="gp-open" data-open="${esc(id)}">Open note &rarr;</button>`;
    }

    function select(id, { focusNode = false, reveal = false } = {}) {
      state.selected = id;
      paint();
      const node = id && canvas.querySelector(`.graph-node[data-id="${CSS.escape(id)}"]`);
      if (node && focusNode) node.focus({ preventScroll: false });
      // When the panel sits below the graph (narrow screens), bring it into view.
      if (reveal && id && getComputedStyle(container.querySelector(".graph-wrap")).flexDirection === "column") {
        panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    // Pick the candidate whose node is horizontally closest to `id`.
    function nearest(cands, id) {
      const from = state.boxes.get(id);
      let best = null, bestD = Infinity;
      cands.forEach(c => {
        const b = state.boxes.get(c);
        const d = Math.abs(b.x + b.w / 2 - (from.x + from.w / 2));
        if (d < bestD) { bestD = d; best = c; }
      });
      return best;
    }

    canvas.addEventListener("mouseover", e => {
      const node = e.target.closest(".graph-node");
      const id = node ? node.dataset.id : null;
      if (id !== state.hovered) { state.hovered = id; paint(); }
    });
    canvas.addEventListener("mouseleave", () => { state.hovered = null; paint(); });
    canvas.addEventListener("click", e => {
      const node = e.target.closest(".graph-node");
      select(node ? node.dataset.id : null, { reveal: true });
    });
    canvas.addEventListener("dblclick", e => {
      const node = e.target.closest(".graph-node");
      if (node) onOpen(node.dataset.id);
    });
    canvas.addEventListener("focusin", e => {
      const node = e.target.closest(".graph-node");
      if (node && node.dataset.id !== state.selected) select(node.dataset.id);
    });
    canvas.addEventListener("keydown", e => {
      const node = e.target.closest(".graph-node");
      if (!node) return;
      const id = node.dataset.id;
      let next = null;
      if (e.key === "Enter") { e.preventDefault(); onOpen(id); return; }
      if (e.key === "ArrowUp") next = nearest(parents.get(id) || [], id);
      else if (e.key === "ArrowDown") next = nearest(children.get(id) || [], id);
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const r = state.boxes.get(id).row;
        const row = items.map(it => it.id).filter(x => state.boxes.get(x).row === r)
          .sort((a, b) => state.boxes.get(a).x - state.boxes.get(b).x);
        next = row[row.indexOf(id) + (e.key === "ArrowLeft" ? -1 : 1)] || null;
      } else if (e.key === "Escape") { select(null); node.blur(); return; }
      else return;
      e.preventDefault();
      if (next) select(next, { focusNode: true });
    });

    panel.addEventListener("click", e => {
      const go = e.target.closest("[data-go]");
      if (go) { select(go.dataset.go, { focusNode: true }); return; }
      const open = e.target.closest("[data-open]");
      if (open) onOpen(open.dataset.open);
    });

    layout();
    if ("ResizeObserver" in window) {
      let lastW = canvas.clientWidth;
      container._graphRO = new ResizeObserver(() => {
        if (canvas.clientWidth === lastW) return;
        lastW = canvas.clientWidth;
        layout();
      });
      container._graphRO.observe(canvas);
    }
  }

  window.NotesGraph = { render };
})();
