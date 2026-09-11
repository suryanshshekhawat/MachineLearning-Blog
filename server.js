const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8791;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "data", "db.json");

function normalizeComment(c) {
  return {
    id: c.id,
    parentId: c.parentId ?? null,
    name: c.name,
    body: c.body,
    createdAt: c.createdAt,
    votes: { up: c.votes?.up ?? 0, down: c.votes?.down ?? 0 },
  };
}

function readDB() {
  let db = { downloads: {}, comments: {} };
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    db = raw.trim() ? JSON.parse(raw) : db;
  }
  db.comments = db.comments || {};
  Object.keys(db.comments).forEach(noteId => {
    db.comments[noteId] = db.comments[noteId].map(normalizeComment);
  });
  return db;
}

function writeDB(db) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

const DOWNLOAD_TYPES = new Set(["pdf", "zip"]);
const MAX_NAME_LEN = 60;
const MAX_BODY_LEN = 2000;

function sanitizeText(value, maxLen) {
  return String(value ?? "").trim().slice(0, maxLen);
}

// "notes" keeps its original flat key (id) so existing data isn't touched.
// Any other kind (e.g. "projects") gets namespaced as "kind:id" so it can't collide.
const ALLOWED_KINDS = new Set(["notes", "projects"]);
function storageKey(kind, id) {
  return kind === "notes" ? id : `${kind}:${id}`;
}
function checkKind(req, res, next) {
  if (!ALLOWED_KINDS.has(req.params.kind)) return res.status(404).json({ error: "unknown kind" });
  next();
}

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get("/api/:kind/:id/downloads", checkKind, (req, res) => {
  const key = storageKey(req.params.kind, req.params.id);
  const db = readDB();
  const counts = db.downloads[key] || { pdf: 0, zip: 0 };
  res.json(counts);
});

app.post("/api/:kind/:id/downloads/:type", checkKind, (req, res) => {
  const key = storageKey(req.params.kind, req.params.id);
  const { type } = req.params;
  if (!DOWNLOAD_TYPES.has(type)) {
    return res.status(400).json({ error: "invalid download type" });
  }
  const db = readDB();
  if (!db.downloads[key]) db.downloads[key] = { pdf: 0, zip: 0 };
  db.downloads[key][type] = (db.downloads[key][type] || 0) + 1;
  writeDB(db);
  res.json(db.downloads[key]);
});

app.get("/api/:kind/:id/comments", checkKind, (req, res) => {
  const key = storageKey(req.params.kind, req.params.id);
  const db = readDB();
  res.json(db.comments[key] || []);
});

app.post("/api/:kind/:id/comments", checkKind, (req, res) => {
  const key = storageKey(req.params.kind, req.params.id);
  const name = sanitizeText(req.body.name, MAX_NAME_LEN) || "Anonymous";
  const body = sanitizeText(req.body.body, MAX_BODY_LEN);
  const parentId = req.body.parentId ? String(req.body.parentId) : null;

  if (!body) {
    return res.status(400).json({ error: "comment text is required" });
  }

  const db = readDB();
  if (!db.comments[key]) db.comments[key] = [];

  if (parentId && !db.comments[key].some(c => c.id === parentId)) {
    return res.status(400).json({ error: "parent comment not found" });
  }

  const comment = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    parentId,
    name,
    body,
    createdAt: new Date().toISOString(),
    votes: { up: 0, down: 0 },
  };
  db.comments[key].push(comment);
  writeDB(db);
  res.status(201).json(comment);
});

app.post("/api/:kind/:id/comments/:commentId/vote", checkKind, (req, res) => {
  const key = storageKey(req.params.kind, req.params.id);
  const { commentId } = req.params;
  const direction = req.body.direction;
  if (direction !== "up" && direction !== "down") {
    return res.status(400).json({ error: "direction must be 'up' or 'down'" });
  }

  const db = readDB();
  const comment = (db.comments[key] || []).find(c => c.id === commentId);
  if (!comment) {
    return res.status(404).json({ error: "comment not found" });
  }

  comment.votes[direction] += 1;
  writeDB(db);
  res.json(comment);
});

app.listen(PORT, () => {
  console.log(`Serving ${PUBLIC_DIR} with API on http://localhost:${PORT}`);
});
