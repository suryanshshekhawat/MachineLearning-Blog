# Personal site

Static frontend (HTML/CSS/JS, no build step) plus a small Node/Express
backend that adds download counts and comments. This means it needs an
actual running Node process now — it can no longer be hosted on a pure
static host like GitHub Pages. Any host that runs a long-lived Node
process works (Render, Railway, Fly.io, a small VPS, etc).

## Running it

```bash
npm install
npm start
```

Serves everything on `http://localhost:8791` (override with `PORT=xxxx`).

## Structure

- `server.js` — Express app: serves `docs/` as static files, plus the
  JSON API below. Keep this and `data/` out of anything served publicly.
- `data/db.json` — JSON file storing download counts and comments. Created
  automatically; back this up if you care about the comment history.
- `docs/index.html` — page shell: header nav (Articles, Projects, Notes,
  Publications, About) and the section panels. Sections switch via the URL
  hash (`#notes`, `#about`, ...) — no page reloads.
- `docs/css/style.css` — all styling (serif, vanilla-HTML link colours,
  white background).
- `docs/js/app.js` — hash router, Notes list/detail logic, PDF.js
  rendering, download-count display, and the comments widget.
- `docs/content/notes.json` — index of notes (title, date, summary, and
  paths to the note's PDF and LaTeX zip).
- `docs/downloads/` — each note's compiled PDF and LaTeX source `.zip`.

## API

- `GET /api/notes/:id/downloads` → `{ pdf, zip }` counts
- `POST /api/notes/:id/downloads/:type` (`type` is `pdf` or `zip`) →
  increments and returns the new counts
- `GET /api/notes/:id/comments` → array of `{ id, name, body, createdAt }`
- `POST /api/notes/:id/comments` with JSON body `{ name, body }` → creates
  a comment

This is wired up for Notes today. To add the same download-count/comments
treatment to Articles/Projects/Publications once they have real entries,
call the same endpoints with that item's id — nothing else to build.

## Notes are just PDFs

Clicking a note opens it in a PDF.js-rendered continuous-scroll viewer
embedded in the page — no page navigation. Download links (with live
counts) sit above it, and a comment thread sits below.

## Adding a new note

1. Add the PDF and its LaTeX `.zip` to `docs/downloads/`.
2. Add an entry to `docs/content/notes.json`:
   ```json
   {
     "id": "unique-id",
     "title": "Note title",
     "date": "YYYY-MM-DD",
     "summary": "One line about it.",
     "pdf": "downloads/your-file.pdf",
     "zip": "downloads/your-file-latex.zip"
   }
   ```

No other code changes needed — downloads and comments work automatically
for any `id`.

## To do before going live

- Fill in Articles / Projects / Publications, or leave as placeholders.
- Decide on a host that can run Node continuously, and point it at
  `npm start`.
- The comment form has no auth/spam protection — fine for a low-traffic
  personal site, but worth knowing before sharing the link widely.
