// Pixel thumbnails for the Articles / Projects / Notes lists.
//
// Each tile is a tiny generative animation drawn at 32x32 and scaled up with
// crisp, ordered-dithered pixels. An entry in content/*.json can set:
//   "anim":  a scene name from SCENES below (e.g. "mach", "sieve")
//   "thumb": an image or GIF path, shown instead of an animation
// Entries with neither get one of the GENERIC scenes, picked from their id.
(function () {
  const N = 32;                 // canvas resolution (pixels per side)
  const FPS = 15;               // a low frame rate suits the pixel look
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const PALETTE = [[18, 15, 24], [58, 30, 102], [126, 64, 232], [205, 190, 255]]; // bg, dim, mid, bright
  const GENERIC = ["mach", "interference", "plasma"];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- helpers (all coordinates are in 0..1) ----

  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
  const frac = x => x - Math.floor(x);

  function blob(x, y, cx, cy, r) {
    const dx = x - cx, dy = y - cy;
    return Math.exp(-(dx * dx + dy * dy) / (r * r));
  }

  function line(x, y, ax, ay, bx, by, w) {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    let t = l ? ((x - ax) * dx + (y - ay) * dy) / l : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + t * dx - x, py = ay + t * dy - y;
    return Math.exp(-(px * px + py * py) / (w * w));
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  // ---- scenes ----
  // Each scene is  rand => t => (x, y) => brightness (0..1).
  // The middle step runs once per frame; the inner one once per pixel.

  const SCENES = {
    // A source moving faster than its own waves: the wavefronts pile up into a
    // Mach cone behind it.
    mach(rand) {
      const v = 0.45, c = 0.2, period = 1.5 / v, dt = 0.1, K = 24;
      const cy = 0.38 + rand() * 0.24;
      return t => {
        const waves = [];
        const base = Math.floor(t / dt) * dt;
        for (let k = 0; k < K; k++) {
          const te = base - k * dt;
          waves.push(-0.25 + frac(te / period) * 1.5, (t - te) * c, 1 - k / K);
        }
        const sx = -0.25 + frac(t / period) * 1.5;
        return (x, y) => {
          let I = 0;
          for (let i = 0; i < waves.length; i += 3) {
            const d = Math.hypot(x - waves[i], y - cy) - waves[i + 1];
            I += waves[i + 2] * Math.exp(-(d * d) / 0.0012);
          }
          return I * 0.45 + blob(x, y, sx, cy, 0.05);
        };
      };
    },

    // Two orbiting point sources and their interference pattern.
    interference(rand) {
      const k = 34 + rand() * 10;
      return t => {
        const a = t * 0.4;
        const ax = 0.5 + 0.22 * Math.cos(a), ay = 0.5 + 0.22 * Math.sin(a);
        const bx = 1 - ax, by = 1 - ay;
        return (x, y) => 0.5 + 0.25 * (
          Math.sin(k * Math.hypot(x - ax, y - ay) - 5 * t) +
          Math.sin(k * Math.hypot(x - bx, y - by) - 5 * t));
      };
    },

    // Classic plasma: summed sines, folded into bands.
    plasma(rand) {
      const p = rand() * 10;
      return t => (x, y) => {
        const v = Math.sin(x * 9 + t + p) + Math.sin(y * 8 - t * 0.7) +
          Math.sin((x + y) * 7 + t * 1.3) + Math.sin(Math.hypot(x - 0.5, y - 0.5) * 16 - t * 2);
        return 0.5 + 0.5 * Math.sin(v * 1.6);
      };
    },

    // Gradient descent zig-zagging down a narrow valley of a loss surface.
    descent(rand) {
      const mx = 0.66, my = 0.56, a = 1.0, b = 5.0, lr = 0.17, steps = 22, cycle = 5;
      const salt = Math.floor(rand() * 1e6);
      let cached = -1, path = [];
      return t => {
        const cyc = Math.floor(t / cycle);
        if (cyc !== cached) {
          cached = cyc;
          const r = rng(salt + cyc * 7919);
          let x = 0.08 + r() * 0.22, y = r() < 0.5 ? 0.1 + r() * 0.15 : 0.78 + r() * 0.14;
          path = [];
          for (let i = 0; i < steps; i++) {
            path.push([x, y]);
            x -= lr * 2 * a * (x - mx);
            y -= lr * 2 * b * (y - my);
          }
        }
        const s = clamp01((t - cyc * cycle) / (cycle * 0.75)) * (steps - 1);
        const i = Math.min(steps - 2, Math.floor(s)), f = s - i;
        const bx = path[i][0] + (path[i + 1][0] - path[i][0]) * f;
        const by = path[i][1] + (path[i + 1][1] - path[i][1]) * f;
        const trail = path.slice(0, i + 1);
        return (x, y) => {
          const q = frac(Math.sqrt(a * (x - mx) ** 2 + b * (y - my) ** 2) * 9);
          const dq = Math.min(q, 1 - q);
          let I = 0.42 * Math.exp(-(dq * dq) / 0.02);
          for (const [px, py] of trail) I = Math.max(I, 0.62 * blob(x, y, px, py, 0.03));
          return Math.max(I, 1.3 * blob(x, y, bx, by, 0.06), 0.5 * blob(x, y, mx, my, 0.03));
        };
      };
    },

    // A forward pass: activity flows layer by layer through a small network.
    network(rand) {
      const layers = [[0.16, 3], [0.5, 4], [0.84, 2]];
      const nodes = layers.map(([x, n]) => Array.from({ length: n }, (_, i) => [x, (i + 1) / (n + 1)]));
      const edges = [];
      for (let l = 0; l < nodes.length - 1; l++) {
        for (const p of nodes[l]) for (const q of nodes[l + 1]) edges.push([p[0], p[1], q[0], q[1], l, 0.6 + rand() * 0.4]);
      }
      return t => {
        const phase = frac(t * 0.45) * 2.4;    // 0..2 travelling, then a short rest
        const pulses = [];
        for (const [ax, ay, bx, by, l, w] of edges) {
          const p = phase - l;
          if (p >= 0 && p <= 1) pulses.push([ax + (bx - ax) * p, ay + (by - ay) * p, w]);
        }
        const glow = nodes.map((_, l) => Math.exp(-((phase - l) ** 2) / 0.04));
        return (x, y) => {
          let I = 0;
          for (const [ax, ay, bx, by] of edges) I = Math.max(I, 0.4 * line(x, y, ax, ay, bx, by, 0.024));
          for (const [px, py, w] of pulses) I = Math.max(I, w * blob(x, y, px, py, 0.035));
          for (let l = 0; l < nodes.length; l++) {
            for (const [nx, ny] of nodes[l]) I = Math.max(I, (0.6 + 0.4 * glow[l]) * blob(x, y, nx, ny, 0.06));
          }
          return I;
        };
      };
    },

    // k-means: scattered points gather around drifting centroids, then scatter.
    clusters(rand) {
      const K = 3, pts = [];
      for (let j = 0; j < K; j++) {
        for (let i = 0; i < 7; i++) {
          pts.push({ j, sx: 0.08 + rand() * 0.84, sy: 0.08 + rand() * 0.84, ox: (rand() - 0.5) * 0.16, oy: (rand() - 0.5) * 0.16 });
        }
      }
      const a0 = rand() * 6.28;
      return t => {
        const tc = frac(t / 7);
        const s = smooth(tc / 0.35) * (1 - smooth((tc - 0.8) / 0.2));
        const cents = Array.from({ length: K }, (_, j) => {
          const ang = a0 + t * 0.25 + (j * 2 * Math.PI) / K;
          return [0.5 + 0.26 * Math.cos(ang), 0.5 + 0.26 * Math.sin(ang)];
        });
        const P = pts.map(p => [p.sx + (cents[p.j][0] + p.ox - p.sx) * s, p.sy + (cents[p.j][1] + p.oy - p.sy) * s]);
        return (x, y) => {
          let I = 0;
          for (const [cx, cy] of cents) I = Math.max(I, 0.32 * s * blob(x, y, cx, cy, 0.13));
          for (const [px, py] of P) I = Math.max(I, blob(x, y, px, py, 0.035));
          return I;
        };
      };
    },

    // A recurrent chain: a signal above, cells below lighting up in sequence.
    wave(rand) {
      const cells = 5, ph = rand() * 6.28;
      return t => {
        const head = frac(t * 0.28) * 1.3 - 0.15;
        return (x, y) => {
          const sig = 0.3 + 0.13 * Math.sin(x * 14 - t * 3 + ph) * Math.sin(x * 3.1 + t * 0.7);
          let I = 0.9 * Math.exp(-((y - sig) ** 2) / 0.0012);
          const ci = Math.floor(x * cells), fx = frac(x * cells);
          if (y > 0.64 && y < 0.86 && fx > 0.16 && fx < 0.84) {
            const lit = Math.exp(-(((ci + 0.5) / cells - head) ** 2) / 0.006);
            const edge = y < 0.68 || y > 0.82 || fx < 0.26 || fx > 0.74;
            I = Math.max(I, edge ? 0.55 + 0.45 * lit : 0.08 + 0.9 * lit);
          } else if (Math.abs(y - 0.75) < 0.02) {
            I = Math.max(I, 0.35);
          }
          return I;
        };
      };
    },

    // A rotating embedding space with a pair of parallel "analogy" vectors.
    embed(rand) {
      const pts = [];
      for (let i = 0; i < 15; i++) {
        const g = i % 3;
        pts.push([g * 2.1 + (rand() - 0.5) * 0.8, 0.14 + rand() * 0.22]);
      }
      return t => {
        const rot = t * 0.3;
        const P = pts.map(([ang, r]) => [0.5 + r * Math.cos(ang + rot), 0.5 + r * Math.sin(ang + rot) * 0.85]);
        const k = Math.floor(t / 1.8) % P.length;
        const A = P[k], B = P[(k + 4) % P.length], C = P[(k + 1) % P.length];
        const D = [C[0] + B[0] - A[0], C[1] + B[1] - A[1]];
        return (x, y) => {
          let I = 0.16 * Math.max(line(x, y, 0.5, 0.06, 0.5, 0.94, 0.012), line(x, y, 0.06, 0.5, 0.94, 0.5, 0.012));
          for (const [px, py] of P) I = Math.max(I, 0.7 * blob(x, y, px, py, 0.035));
          I = Math.max(I, 0.95 * line(x, y, A[0], A[1], B[0], B[1], 0.018), 0.95 * line(x, y, C[0], C[1], D[0], D[1], 0.018));
          return Math.max(I, blob(x, y, D[0], D[1], 0.045));
        };
      };
    },

    // Attention: one query token at a time attends over the source tokens.
    attention(rand) {
      const n = 6, xs = Array.from({ length: n }, (_, i) => 0.12 + (i * 0.76) / (n - 1));
      const W = Array.from({ length: n }, () => {
        const e = Array.from({ length: n }, () => Math.exp(rand() * 5));
        const s = e.reduce((p, q) => p + q, 0);
        return e.map(v => v / s);
      });
      return t => {
        const q = Math.floor(t / 1.1) % n, fade = smooth(frac(t / 1.1) / 0.3);
        return (x, y) => {
          let I = 0;
          for (let j = 0; j < n; j++) {
            I = Math.max(I, Math.min(1, W[q][j] * 2.4) * fade * line(x, y, xs[q], 0.78, xs[j], 0.22, 0.022));
            I = Math.max(I, (0.35 + Math.min(0.65, W[q][j] * 2 * fade)) * blob(x, y, xs[j], 0.18, 0.045));
            I = Math.max(I, (j === q ? 1 : 0.4) * blob(x, y, xs[j], 0.82, 0.045));
          }
          return I;
        };
      };
    },

    // A causal self-attention map: lower triangle shimmering, upper masked.
    transformer(rand) {
      const n = 8;
      const ph = Array.from({ length: n * n }, () => rand() * 6.28);
      const sp = Array.from({ length: n * n }, () => 0.6 + rand() * 1.4);
      return t => (x, y) => {
        if (frac(x * n) > 0.75 || frac(y * n) > 0.75) return 0;
        const i = Math.floor(y * n), j = Math.floor(x * n);
        if (j > i) return 0.1;
        const v = 0.5 + 0.5 * Math.sin(ph[i * n + j] + t * sp[i * n + j]);
        return j === i ? 0.55 + 0.45 * v : 0.15 + 0.75 * v * v;
      };
    },

    // Sieve of Eratosthenes on 2..65: each prime crosses out its multiples.
    sieve() {
      const n = 8, primes = [2, 3, 5, 7], step = 1.2, hold = 2.2;
      const cycle = primes.length * step + hold;
      return t => {
        const tc = t % cycle, s = Math.floor(tc / step), within = frac(tc / step);
        return (x, y) => {
          if (frac(x * n) > 0.75 || frac(y * n) > 0.75) return 0;
          const num = 2 + Math.floor(y * n) * n + Math.floor(x * n);
          let by = -1;
          for (let k = 0; k < primes.length; k++) {
            if (num !== primes[k] && num % primes[k] === 0) { by = k; break; }
          }
          if (by === -1) {
            const pi = primes.indexOf(num);
            if (pi !== -1) return pi <= s ? 1 : 0.42;
            return s >= primes.length ? 1 : 0.42;
          }
          if (by < s) return 0.1;
          if (by === s) return within < 0.35 ? 0.95 : 0.1 + 0.85 * (1 - smooth((within - 0.35) / 0.5));
          return 0.42;
        };
      };
    },

    // Federated learning: clients send updates in, the server aggregates and
    // sends the new model back out.
    federated(rand) {
      const m = 5, off = rand() * 6.28;
      return t => {
        const rot = off + t * 0.15, p = frac(t / 2.6);
        const C = Array.from({ length: m }, (_, i) => {
          const ang = rot + (i * 2 * Math.PI) / m;
          return [0.5 + 0.36 * Math.cos(ang), 0.5 + 0.36 * Math.sin(ang)];
        });
        const up = p < 0.42, down = p > 0.58;
        const f = up ? smooth(p / 0.42) : down ? smooth((p - 0.58) / 0.42) : 0;
        const k = up ? f : 1 - f;
        const pulse = p >= 0.42 && p <= 0.75 ? (p - 0.42) / 0.33 : -1;
        return (x, y) => {
          let I = 0;
          for (const [cx, cy] of C) {
            I = Math.max(I, 0.24 * line(x, y, cx, cy, 0.5, 0.5, 0.02));
            I = Math.max(I, 0.7 * blob(x, y, cx, cy, 0.06));
            if (up || down) I = Math.max(I, blob(x, y, cx + (0.5 - cx) * k, cy + (0.5 - cy) * k, 0.035));
          }
          I = Math.max(I, 0.85 * blob(x, y, 0.5, 0.5, 0.07));
          if (pulse >= 0) {
            const d = Math.hypot(x - 0.5, y - 0.5) - pulse * 0.45;
            I = Math.max(I, (1 - pulse) * Math.exp(-(d * d) / 0.0015));
          }
          return I;
        };
      };
    },
  };

  // ---- engine ----

  const visible = new Set();
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        for (const e of entries) {
          const tile = e.target._thumb;
          if (!tile) continue;
          if (e.isIntersecting) visible.add(tile); else visible.delete(tile);
        }
        kick();
      })
    : null;

  function makeTile(canvas) {
    const key = canvas.dataset.seed || "";
    const name = SCENES[canvas.dataset.anim] ? canvas.dataset.anim : GENERIC[hash(key) % GENERIC.length];
    const rand = rng(hash(`${key}:${name}`));
    const ctx = canvas.getContext("2d");
    return { canvas, ctx, img: ctx.createImageData(N, N), scene: SCENES[name](rand), t0: rand() * 20 };
  }

  function draw(tile, now) {
    const field = tile.scene(tile.t0 + now / 1000);
    const d = tile.img.data;
    let o = 0;
    for (let py = 0; py < N; py++) {
      const y = (py + 0.5) / N;
      for (let px = 0; px < N; px++, o += 4) {
        const v = field((px + 0.5) / N, y);
        let lvl = Math.floor((v > 1 ? 1 : v < 0 ? 0 : v) * 3 + BAYER[((py & 3) << 2) | (px & 3)]);
        if (lvl > 3) lvl = 3;
        const c = PALETTE[lvl];
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    tile.ctx.putImageData(tile.img, 0, 0);
  }

  let running = false, last = 0;

  function loop(now) {
    if (!visible.size) { running = false; return; }
    if (now - last >= 1000 / FPS) {
      last = now;
      for (const tile of visible) {
        if (tile.canvas.isConnected) draw(tile, now);
        else { visible.delete(tile); if (io) io.unobserve(tile.canvas); }
      }
    }
    requestAnimationFrame(loop);
  }

  function kick() {
    if (!running && !reduceMotion && visible.size) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  // Start every not-yet-started tile inside `root`.
  function mount(root) {
    root.querySelectorAll("canvas[data-anim]").forEach(canvas => {
      if (canvas._thumb) return;
      const tile = (canvas._thumb = makeTile(canvas));
      draw(tile, 2500); // a frame straight away (the only one with reduced motion)
      if (reduceMotion) return;
      if (io) io.observe(canvas);
      else { visible.add(tile); kick(); }
    });
  }

  const escapeAttr = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Markup for one row's tile.
  function html(item) {
    const inner = item.thumb
      ? `<img src="${escapeAttr(item.thumb)}" alt="" loading="lazy">`
      : `<canvas width="${N}" height="${N}" data-anim="${escapeAttr(item.anim || "")}" data-seed="${escapeAttr(item.id)}"></canvas>`;
    return `<span class="note-item-thumb" aria-hidden="true">${inner}</span>`;
  }

  window.Thumbs = { html, mount, scenes: Object.keys(SCENES) };
})();
