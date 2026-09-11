const SECTIONS = ["articles", "projects", "notes", "publications", "about"];
const DEFAULT_SECTION = "articles";

const navLinks = document.querySelectorAll(".nav-link");
const panels = {};
SECTIONS.forEach(id => { panels[id] = document.getElementById(id); });

const notesListEl = document.getElementById("notes-list");
const notesDetailEl = document.getElementById("notes-detail");
const noteTitleEl = document.getElementById("note-title");
const noteDownloadsEl = document.getElementById("note-downloads");
const pdfViewerEl = document.getElementById("note-pdf-viewer");
const commentsEl = document.getElementById("note-comments");
const backToNotesBtn = document.getElementById("back-to-notes");

const articlesListEl = document.getElementById("articles-list");
const articleDetailEl = document.getElementById("article-detail");
const articleTitleEl = document.getElementById("article-title");
const articleDownloadsEl = document.getElementById("article-downloads");
const articlePdfViewerEl = document.getElementById("article-pdf-viewer");
const articleCommentsEl = document.getElementById("article-comments");
const backToArticlesBtn = document.getElementById("back-to-articles");

const projectsListEl = document.getElementById("projects-list");
const projectDetailEl = document.getElementById("project-detail");
const projectNavEl = document.getElementById("project-nav");
const projectContentEl = document.getElementById("project-content");
const projectCommentsEl = document.getElementById("project-comments");
const backToProjectsBtn = document.getElementById("back-to-projects");
const readingProgressEl = document.getElementById("reading-progress");
const readingProgressBarEl = document.getElementById("reading-progress-bar");

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

async function renderPdfInto(container, url, tokenHolder) {
  const token = ++tokenHolder.value;
  container.innerHTML = '<p class="pdf-status">Loading PDF…</p>';

  const pdf = await pdfjsLib.getDocument(url).promise;
  if (token !== tokenHolder.value) return;

  container.innerHTML = "";
  const containerWidth = container.clientWidth - 16;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    if (token !== tokenHolder.value) return;

    const page = await pdf.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = (containerWidth / unscaledViewport.width) * (window.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;

    if (token !== tokenHolder.value) return;
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
  }
}

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function trackDownload(kind, id, type) {
  fetch(`/api/${kind}/${id}/downloads/${type}`, { method: "POST" }).catch(() => {});
}

function formatCommentDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const COMMENT_SORTS = {
  newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  top: (a, b) => (b.votes.up - b.votes.down) - (a.votes.up - a.votes.down)
    || new Date(b.createdAt) - new Date(a.createdAt),
};

function buildCommentTree(comments, sortMode) {
  const nodes = new Map(comments.map(c => [c.id, { ...c, replies: [] }]));
  const roots = [];
  nodes.forEach(node => {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId).replies.push(node);
    } else {
      roots.push(node);
    }
  });
  // Replies always stay in chronological order — sorting only reorders top-level threads.
  const sortReplies = list => {
    list.sort(COMMENT_SORTS.oldest);
    list.forEach(n => sortReplies(n.replies));
  };
  sortReplies(roots);
  roots.sort(COMMENT_SORTS[sortMode] || COMMENT_SORTS.newest);
  return roots;
}

function commentFormHTML(placeholder) {
  return `
    <form class="comment-form">
      <input type="text" name="name" maxlength="60" placeholder="Name (optional)">
      <textarea name="body" maxlength="2000" rows="3" placeholder="${placeholder}" required></textarea>
      <div class="comment-form-actions">
        <button type="submit">Post</button>
      </div>
      <p class="comment-status" hidden></p>
    </form>
  `;
}

function wireCommentForm(formEl, kind, id, parentId, onPosted) {
  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = formEl.name.value;
    const body = formEl.body.value;
    if (!body.trim()) return;

    const statusEl = formEl.querySelector(".comment-status");
    const submitBtn = formEl.querySelector("button");
    submitBtn.disabled = true;
    statusEl.hidden = true;

    try {
      await fetchJSON(`/api/${kind}/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, body, parentId }),
      });
      formEl.reset();
      onPosted();
    } catch {
      statusEl.hidden = false;
      statusEl.textContent = "Couldn't post — try again.";
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function castVote(kind, id, commentId, direction, upBtn, downBtn) {
  const votedKey = `voted:${commentId}`;
  if (localStorage.getItem(votedKey)) return;

  upBtn.disabled = true;
  downBtn.disabled = true;
  try {
    const updated = await fetchJSON(`/api/${kind}/${id}/comments/${commentId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    upBtn.textContent = `▲ ${updated.votes.up}`;
    downBtn.textContent = `▼ ${updated.votes.down}`;
    localStorage.setItem(votedKey, direction);
  } catch {
    upBtn.disabled = false;
    downBtn.disabled = false;
  }
}

function renderCommentNode(node, kind, id, listEl, depth) {
  const item = document.createElement("div");
  item.className = "comment";
  if (depth > 0) item.classList.add("comment-reply");

  const meta = document.createElement("p");
  meta.className = "comment-meta";
  meta.textContent = `${node.name} — ${formatCommentDate(node.createdAt)}`;

  const body = document.createElement("p");
  body.className = "comment-body";
  body.textContent = node.body;

  const actions = document.createElement("div");
  actions.className = "comment-actions";

  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "vote-btn";
  upBtn.textContent = `▲ ${node.votes.up}`;

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "vote-btn";
  downBtn.textContent = `▼ ${node.votes.down}`;

  if (localStorage.getItem(`voted:${node.id}`)) {
    upBtn.disabled = true;
    downBtn.disabled = true;
  }

  upBtn.addEventListener("click", () => castVote(kind, id, node.id, "up", upBtn, downBtn));
  downBtn.addEventListener("click", () => castVote(kind, id, node.id, "down", upBtn, downBtn));

  const replyBtn = document.createElement("button");
  replyBtn.type = "button";
  replyBtn.className = "reply-btn";
  replyBtn.textContent = "Reply";

  actions.append(upBtn, downBtn, replyBtn);
  item.append(meta, body, actions);

  const replyFormWrap = document.createElement("div");
  replyFormWrap.className = "reply-form-wrap";
  replyFormWrap.hidden = true;
  item.appendChild(replyFormWrap);

  replyBtn.addEventListener("click", () => {
    const isHidden = replyFormWrap.hidden;
    replyFormWrap.hidden = !isHidden;
    if (isHidden) {
      replyFormWrap.innerHTML = commentFormHTML("Write a reply");
      const formEl = replyFormWrap.querySelector("form");
      formEl.querySelector("textarea").focus();
      wireCommentForm(formEl, kind, id, node.id, () => {
        replyFormWrap.hidden = true;
        replyFormWrap.innerHTML = "";
        reloadComments(kind, id, listEl);
      });
    } else {
      replyFormWrap.innerHTML = "";
    }
  });

  listEl.appendChild(item);

  if (node.replies.length) {
    const repliesWrap = document.createElement("div");
    repliesWrap.className = "comment-replies";
    item.appendChild(repliesWrap);
    node.replies.forEach(child => renderCommentNode(child, kind, id, repliesWrap, depth + 1));
  }
}

let currentCommentSort = "newest";
let cachedComments = [];

function renderCommentTree(listEl, comments) {
  cachedComments = comments;
  listEl.innerHTML = "";
  if (!comments.length) {
    listEl.innerHTML = '<p class="comments-empty">No comments yet.</p>';
    return;
  }
  const tree = buildCommentTree(comments, currentCommentSort);
  tree.forEach(node => renderCommentNode(node, listEl.dataset.kind, listEl.dataset.id, listEl, 0));
}

function reloadComments(kind, id, listEl) {
  return fetchJSON(`/api/${kind}/${id}/comments`)
    .then(comments => renderCommentTree(listEl, comments))
    .catch(() => { listEl.innerHTML = '<p class="comments-empty">Couldn\'t load comments.</p>'; });
}

function renderComments(kind, id, containerEl) {
  currentCommentSort = "newest";
  containerEl.innerHTML = `
    <div class="comments-header">
      <h4 class="comments-title">Comments</h4>
      <label class="comments-sort">
        Sort by
        <select>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="top">Top voted</option>
        </select>
      </label>
    </div>
    <div class="comments-list"></div>
    ${commentFormHTML("Leave a comment")}
  `;

  const sortSelect = containerEl.querySelector(".comments-sort select");
  sortSelect.value = currentCommentSort;
  const listEl = containerEl.querySelector(".comments-list");
  sortSelect.addEventListener("change", () => {
    currentCommentSort = sortSelect.value;
    renderCommentTree(listEl, cachedComments);
  });

  listEl.dataset.kind = kind;
  listEl.dataset.id = id;
  listEl.innerHTML = '<p class="comments-empty">Loading comments…</p>';

  const formEl = containerEl.querySelector(".comment-form");
  wireCommentForm(formEl, kind, id, null, () => reloadComments(kind, id, listEl));

  reloadComments(kind, id, listEl);
}

// Shared by any section that's just "a list of PDFs with downloads and comments"
// (notes, articles). Projects are structurally different (composed blocks), so
// they get their own logic further down.
function createPdfLibrary({ kind, contentUrl, listEl, detailEl, titleEl, downloadsEl, pdfViewerEl, commentsEl, backBtn }) {
  let index = null;
  const pdfToken = { value: 0 };

  async function loadIndex() {
    if (!index) index = await fetch(contentUrl).then(r => r.json());
    return index;
  }

  function renderList(items) {
    listEl.innerHTML = items.map(item => `
      <button class="note-item" data-item-id="${item.id}">
        <p class="note-item-title">${item.title}</p>
        <p class="note-item-meta">${item.date}</p>
        <p class="note-item-summary">${item.summary}</p>
      </button>
    `).join("");

    listEl.querySelectorAll(".note-item").forEach(btn => {
      btn.addEventListener("click", () => {
        location.hash = `#${kind}/${btn.dataset.itemId}`;
      });
    });
  }

  async function showItem(id) {
    const items = await loadIndex();
    const item = items.find(x => x.id === id);
    if (!item) {
      listEl.hidden = false;
      detailEl.hidden = true;
      return;
    }

    titleEl.textContent = item.title;

    downloadsEl.innerHTML = "";
    if (item.pdf) {
      downloadsEl.innerHTML += `<a href="${item.pdf}" download data-download-type="pdf">Download PDF <span class="download-count" data-count-type="pdf"></span></a>`;
    }
    if (item.zip) {
      downloadsEl.innerHTML += `<a href="${item.zip}" download data-download-type="zip">Download LaTeX source (.zip) <span class="download-count" data-count-type="zip"></span></a>`;
    }
    downloadsEl.querySelectorAll("a[data-download-type]").forEach(link => {
      link.addEventListener("click", () => trackDownload(kind, id, link.dataset.downloadType));
    });
    fetchJSON(`/api/${kind}/${id}/downloads`)
      .then(counts => {
        downloadsEl.querySelectorAll("[data-count-type]").forEach(el => {
          el.textContent = `(${counts[el.dataset.countType] || 0})`;
        });
      })
      .catch(() => {});

    listEl.hidden = true;
    detailEl.hidden = false;

    if (item.pdf) renderPdfInto(pdfViewerEl, item.pdf, pdfToken);
    renderComments(kind, id, commentsEl);
  }

  async function enterList() {
    renderList(await loadIndex());
    listEl.hidden = false;
    detailEl.hidden = true;
    pdfToken.value++;
    pdfViewerEl.innerHTML = "";
    commentsEl.innerHTML = "";
  }

  backBtn.addEventListener("click", () => { location.hash = `#${kind}`; });

  return { showItem, enterList };
}

const notesLibrary = createPdfLibrary({
  kind: "notes",
  contentUrl: "content/notes.json",
  listEl: notesListEl,
  detailEl: notesDetailEl,
  titleEl: noteTitleEl,
  downloadsEl: noteDownloadsEl,
  pdfViewerEl: pdfViewerEl,
  commentsEl: commentsEl,
  backBtn: backToNotesBtn,
});

const articlesLibrary = createPdfLibrary({
  kind: "articles",
  contentUrl: "content/articles.json",
  listEl: articlesListEl,
  detailEl: articleDetailEl,
  titleEl: articleTitleEl,
  downloadsEl: articleDownloadsEl,
  pdfViewerEl: articlePdfViewerEl,
  commentsEl: articleCommentsEl,
  backBtn: backToArticlesBtn,
});

let projectsIndex = null;

async function loadProjectsIndex() {
  if (projectsIndex) return projectsIndex;
  const res = await fetch("content/projects.json");
  projectsIndex = await res.json();
  return projectsIndex;
}

function renderProjectsList(projects) {
  projectsListEl.innerHTML = projects.map(project => `
    <button class="note-item" data-project-id="${project.id}">
      <p class="note-item-title">${project.title}</p>
      <p class="note-item-meta">${project.date}</p>
      <p class="note-item-summary">${project.summary}</p>
    </button>
  `).join("");

  projectsListEl.querySelectorAll(".note-item").forEach(btn => {
    btn.addEventListener("click", () => {
      location.hash = `#projects/${btn.dataset.projectId}`;
    });
  });
}

function renderProjectBlock(block) {
  if (block.type === "chapter") {
    const el = document.createElement("div");
    el.className = "project-chapter";
    el.id = block.id;
    el.innerHTML = `<span class="project-chapter-number">${block.number}</span><h2 class="project-chapter-title">${block.title}</h2>`;
    return el;
  }

  if (block.type === "tldr") {
    const el = document.createElement("div");
    el.className = "project-tldr";
    el.innerHTML = `<p class="project-tldr-label">At a glance</p><ul>${block.items.map(i => `<li>${i}</li>`).join("")}</ul>`;
    return el;
  }

  if (block.type === "stat") {
    const el = document.createElement("div");
    el.className = "project-stat";
    el.innerHTML = `<p class="project-stat-value">${block.value}</p><p class="project-stat-label">${block.label}</p>`;
    return el;
  }

  if (block.type === "text") {
    const el = document.createElement("div");
    el.className = "project-text";
    el.innerHTML = block.html;
    return el;
  }

  if (block.type === "image") {
    const figure = document.createElement("figure");
    figure.className = "project-figure";
    const img = document.createElement("img");
    img.src = block.src;
    img.alt = block.caption || "";
    figure.appendChild(img);
    if (block.caption) {
      const cap = document.createElement("figcaption");
      cap.innerHTML = block.caption;
      figure.appendChild(cap);
    }
    return figure;
  }

  if (block.type === "iframe") {
    const wrap = document.createElement("div");
    wrap.className = "project-iframe-wrap";
    if (block.caption) {
      const cap = document.createElement("p");
      cap.className = "project-iframe-caption";
      cap.innerHTML = block.caption;
      wrap.appendChild(cap);
    }
    const frame = document.createElement("iframe");
    frame.className = "project-iframe";
    frame.src = block.src;
    frame.style.height = `${block.height || 600}px`;
    frame.loading = "lazy";
    wrap.appendChild(frame);
    return wrap;
  }

  if (block.type === "table") {
    const wrap = document.createElement("div");
    wrap.className = "project-table-wrap";
    const table = document.createElement("table");
    const thead = document.createElement("tr");
    block.headers.forEach(h => {
      const th = document.createElement("th");
      th.innerHTML = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);
    block.rows.forEach(row => {
      const tr = document.createElement("tr");
      row.forEach(cell => {
        const td = document.createElement("td");
        td.innerHTML = cell;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    if (block.note) {
      const note = document.createElement("p");
      note.className = "project-table-note";
      note.textContent = block.note;
      wrap.appendChild(note);
    }
    return wrap;
  }

  if (block.type === "downloads") {
    const wrap = document.createElement("div");
    wrap.className = "note-downloads";
    block.items.forEach((item, i) => {
      const a = document.createElement("a");
      a.href = item.href;
      a.download = "";
      a.dataset.downloadType = item.type || `file${i}`;
      a.innerHTML = `${item.label} <span class="download-count" data-count-type="${item.type || `file${i}`}"></span>`;
      wrap.appendChild(a);
    });
    return wrap;
  }

  if (block.type === "collapsible-pdf") {
    const wrap = document.createElement("div");
    wrap.className = "project-collapsible";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "project-collapsible-toggle";
    toggle.textContent = `[+] ${block.label}`;

    const pane = document.createElement("div");
    pane.className = "pdf-viewer project-collapsible-pane";
    pane.hidden = true;

    let rendered = false;
    const tokenHolder = { value: 0 };
    toggle.addEventListener("click", () => {
      const opening = pane.hidden;
      pane.hidden = !opening;
      toggle.textContent = `[${opening ? "–" : "+"}] ${block.label}`;
      if (opening && !rendered) {
        rendered = true;
        renderPdfInto(pane, block.src, tokenHolder);
      }
    });

    wrap.append(toggle, pane);
    return wrap;
  }

  return document.createElement("div");
}

let activeChapterEls = [];

function teardownScrollSpy() {
  activeChapterEls = [];
}

function updateActiveChapter() {
  if (!activeChapterEls.length) return;
  const threshold = 90; // roughly the sticky nav's height
  let current = activeChapterEls[0];
  for (const entry of activeChapterEls) {
    if (entry.el.getBoundingClientRect().top - threshold <= 0) {
      current = entry;
    } else {
      break;
    }
  }
  projectNavEl.querySelectorAll("button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.chapter === current.id);
  });
}

function setupProjectNav(project) {
  const chapters = project.blocks.filter(b => b.type === "chapter");
  if (!chapters.length) {
    projectNavEl.hidden = true;
    projectNavEl.innerHTML = "";
    teardownScrollSpy();
    return;
  }

  projectNavEl.hidden = false;
  projectNavEl.innerHTML = chapters.map(c => `<button type="button" data-chapter="${c.id}">${c.number} ${c.title}</button>`).join("");

  projectNavEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.chapter);
      if (target) target.scrollIntoView({ block: "start" });
      updateReadingProgress();
    });
  });

  activeChapterEls = chapters
    .map(c => ({ id: c.id, el: document.getElementById(c.id) }))
    .filter(entry => entry.el);
  updateActiveChapter();
}

function updateReadingProgress() {
  if (!document.body.classList.contains("project-reading")) return;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const pct = scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0;
  readingProgressBarEl.style.width = `${pct}%`;
  updateActiveChapter();
}

window.addEventListener("scroll", updateReadingProgress, { passive: true });

async function showProject(projectId) {
  const projects = await loadProjectsIndex();
  const project = projects.find(p => p.id === projectId);
  if (!project) {
    projectsListEl.hidden = false;
    projectDetailEl.hidden = true;
    return;
  }

  projectContentEl.innerHTML = "";
  project.blocks.forEach(block => {
    projectContentEl.appendChild(renderProjectBlock(block));
  });

  projectContentEl.querySelectorAll(".note-downloads a[data-download-type]").forEach(link => {
    link.addEventListener("click", () => trackDownload("projects", project.id, link.dataset.downloadType));
  });
  fetchJSON(`/api/projects/${project.id}/downloads`)
    .then(counts => {
      projectContentEl.querySelectorAll("[data-count-type]").forEach(el => {
        const count = counts[el.dataset.countType] || 0;
        el.textContent = `(${count})`;
      });
    })
    .catch(() => {});

  readingProgressBarEl.style.width = "0%";
  readingProgressEl.hidden = false;

  projectsListEl.hidden = true;
  projectDetailEl.hidden = false;

  setupProjectNav(project);
  renderComments("projects", project.id, projectCommentsEl);
}

async function enterProjectsList() {
  const projects = await loadProjectsIndex();
  renderProjectsList(projects);
  projectsListEl.hidden = false;
  projectDetailEl.hidden = true;
  projectContentEl.innerHTML = "";
  projectCommentsEl.innerHTML = "";
  teardownScrollSpy();
  readingProgressEl.hidden = true;
}

backToProjectsBtn.addEventListener("click", () => {
  location.hash = "#projects";
});

function setActiveNav(section) {
  navLinks.forEach(link => {
    link.classList.toggle("active", link.dataset.section === section);
  });
}

function showPanel(section) {
  SECTIONS.forEach(id => panels[id].classList.toggle("active", id === section));
  setActiveNav(section);
}

async function route() {
  const hash = location.hash.replace(/^#/, "");
  const [section, sub] = hash.split("/");
  const validSection = SECTIONS.includes(section) ? section : DEFAULT_SECTION;

  showPanel(validSection);
  document.body.classList.toggle("note-reading", (validSection === "notes" || validSection === "articles") && !!sub);
  document.body.classList.toggle("project-reading", validSection === "projects" && !!sub);

  if (validSection === "notes") {
    if (sub) {
      await notesLibrary.showItem(sub);
    } else {
      await notesLibrary.enterList();
    }
  }

  if (validSection === "articles") {
    if (sub) {
      await articlesLibrary.showItem(sub);
    } else {
      await articlesLibrary.enterList();
    }
  }

  if (validSection === "projects") {
    if (sub) {
      await showProject(sub);
    } else {
      await enterProjectsList();
    }
  }

  window.scrollTo(0, 0);
}

navLinks.forEach(link => {
  link.addEventListener("click", () => {
    location.hash = `#${link.dataset.section}`;
  });
});

window.addEventListener("hashchange", route);
route();
