# Study Lab — React JavaScript source

A React + Vite Study Lab application. Local development uses the included Node.js API and SQLite; Vercel production uses Functions, PostgreSQL and private Vercel Blob storage. All application code is JavaScript (`.js`) and JSX (`.jsx`); no TypeScript compilation is required.

## Start on your computer

Install Node.js 22.13 or newer, extract this ZIP, and open the `study-lab-react` folder in VS Code. In its terminal, run:

```bash
npm install
npm run dev
```

`npm run dev` starts both the API server on port 3001 and Vite on port 5173. Open the local URL printed by Vite. Do not open `index.html` directly from the file manager.

```bash
npm test          # Export and progress regression tests
npm run build     # Create the production dist folder
npm start         # Serve the production build and API on port 3001
```

The lockfile is included; use `npm ci` instead of `npm install` for an exact repeat installation.

## Included features

- Add custom subjects and switch between their individual workspaces.
- Create a new PowerPoint from lecture slide photos.
- Upload an existing `.pptx` and append new slides, preserving original slides.
- Upload JPG, PNG or WebP photos; reorder or remove pending slides.
- English and Myanmar text extraction with locally hosted OCR assets.
- Export each complete photo, or reviewed editable title/body text beside its source photo. Long editable content is split across slides.
- Separate automatic photo/text drafts for each subject.
- A per-subject Study Chat with saved conversations, streaming responses, retry/stop controls and lesson-grounded answers.
- A subject Resource Library for PDF books, Word documents, PowerPoints, Markdown, text, JSON and CSV. Original files are stored under `data/uploads`; structured metadata, chunks and notes live in SQLite.
- Reviewable study-note drafts with page/slide citations, publishing, and generated flashcards and practice prompts. Study Chat prioritizes published notes.
- Existing Programming Languages lessons, Myanmar explanations, flashcards, questions, comparisons and progress tracking.

## How to use

1. Use **Add subject**, or keep **Programming Languages** selected.
2. Open **Slide studio**.
3. Select **Create new PowerPoint** or **Add to existing PowerPoint**.
4. For append mode, choose your existing `.pptx` file.
5. Upload lecture photos and use the arrows to arrange them.
6. For editable slides, select each photo, click **Extract text**, correct its title and body, and mark it reviewed. You can type text manually too.
7. Download your presentation. The selected original PowerPoint is never overwritten.

## Main source files

| File | Purpose |
| --- | --- |
| `src/App.jsx` | Main dashboard, subject picker, lessons, flashcards and questions |
| `src/SlideStudio.jsx` | Photo uploads, editing, OCR and export controls |
| `src/SubjectHome.jsx` | Custom subject overview |
| `src/content.js` | Programming Languages learning content and lecture link |
| `src/styles.css` | Responsive design and appearance |
| `src/lib/slide-deck.js` | PowerPoint generation, pagination and merging |
| `src/lib/studio-storage.js` | Subject photo/text drafts in IndexedDB |
| `src/lib/progress.js` | Local study progress persistence |
| `src/lib/study-path.js` | Selection of the next unreviewed topic |
| `public/ocr/` | Bundled OCR worker, WebAssembly cores and language data |

### Backend source layout

| File | Purpose |
| --- | --- |
| `server/index.js` | Creates and starts the HTTP server |
| `server/app.js` | Environment-independent API handler used locally and by Vercel |
| `api/router.js` | Vercel Function entry point for all `/api/*` routes |
| `server/api-router.js` | Dispatches API requests to focused route modules |
| `server/routes/chat.js` | Saves messages and streams study answers |
| `server/routes/conversations.js` | Conversation listing, creation and deletion |
| `server/routes/lessons.js` | Lesson listing and file-import endpoint |
| `server/routes/resources.js` | Subject source-library upload and listing |
| `server/routes/study-notes.js` | Note editing, review and publishing |
| `server/database.js` | Local SQLite schema and persistence operations |
| `server/postgres-repository.js` | PostgreSQL persistence used by Vercel Functions |
| `server/postgres-schema.sql` | Idempotent production database migration |
| `server/lesson-import.js` | PDF, text, Word and PowerPoint extraction |
| `server/resource-service.js` | Physical file storage, chunking and draft-note creation |
| `server/session.js` | Anonymous HTTP-only session handling |
| `server/rate-limit.js` | Per-session message rate limiting |
| `server/static-files.js` | Production frontend asset serving |
| `server/http.js` | Shared JSON, validation and error helpers |

## Storage and scope

Subject names, progress and preferences remain in browser localStorage, and photo drafts use IndexedDB. Study Chat conversations are stored in `data/study-lab.sqlite` when the Node server is available and cached in localStorage for offline fallback. The server creates an anonymous, HTTP-only browser session and checks conversation ownership on every query. This edition does not provide named account sign-in or automatic cross-device identity. Keep downloaded presentations as backups; clearing browser site data removes local progress and drafts. Previously selected base PowerPoint files must be selected again after a reload.

Every subject has Resources, Study Notes, Study Chat and Slide Studio. The supplied guided lessons remain available for Programming Languages. Custom subjects gain trusted study content by uploading resources, reviewing generated note drafts and publishing them.

Study Chat searches published study notes first and streams the supported answer to the browser. Draft notes are deliberately excluded. If a subject has no published note, Programming Languages can fall back to its built-in content; custom subjects require a published note. No chat or resource text is sent to a third party. Set `DATABASE_PATH`, `UPLOADS_DIRECTORY`, `PORT` or `VITE_API_URL` only when their defaults do not fit the deployment.

### Resource-to-study workflow

1. Start the app with `npm run dev`, select a subject and open **Resources**.
2. Upload a text-based PDF, `.txt`, `.md`, `.json`, `.csv`, `.docx` or `.pptx` file. Local uploads support 10 MB; Vercel Blob uploads support 50 MB.
3. Locally, the original is saved under `data/uploads/<user>/<subject>/<resource>/`. On Vercel, the browser uploads directly to a private Blob path under `resources/<user>/<subject>/`. Extracted page, slide or section chunks are stored in SQLite locally or PostgreSQL in production.
4. Study Lab creates a draft under **Study notes**. Review and edit its overview and sections; each section displays its source file and page, slide or section label.
5. Publish the reviewed note. Publishing creates flashcards and practice prompts derived from that version.
6. Study Chat now uses the published note as its trusted subject context and identifies that note in its answer.

Scanned PDFs and image-only Word or PowerPoint documents require OCR. The importer reports that no selectable text was found; convert them to text or use Slide Studio's OCR workflow first.

OCR is text recognition, not generative AI. Review results, especially equations, code, handwriting and unclear photos. Diagrams stay inside the source photo; they are not converted to editable shapes. English and Myanmar models are bundled, with no OCR API key required. Fonts optionally load from Google Fonts; system fonts are used if unavailable. Install Myanmar fonts locally for best PowerPoint rendering.

Limits: 40 photos per batch, 15 MB per photo, 40 MB for a base PowerPoint, and 200 MB for its uncompressed package. Uploaded photos are resized to a maximum dimension of 2200 px.

## Deploy to Vercel

The production architecture is:

```text
Browser (Vite React)
  ├── small API requests → Vercel Functions → PostgreSQL
  └── source file upload → private Vercel Blob
                                  └── processing Function → resource chunks + draft note
```

### 1. Create the Vercel project

Push this folder to a Git repository, import it at Vercel, and keep the detected framework as **Vite**. The included `vercel.json` runs the PostgreSQL migration and then builds `dist`.

### 2. Add PostgreSQL

In the Vercel project, open **Storage / Marketplace**, add a PostgreSQL provider such as Neon, and connect it to all environments that should run Study Lab. Confirm that the integration creates a `DATABASE_URL` environment variable. The build command runs `npm run db:migrate`; the migration is idempotent and creates users, sessions, resources, chunks, study notes, artifacts and chats.

To run the same migration manually:

```bash
DATABASE_URL='postgresql://…' npm run db:migrate
```

### 3. Add private Blob storage

Create a Vercel Blob store and connect it to the project. Confirm that `BLOB_READ_WRITE_TOKEN` is available. The application requests a short-lived upload token from `/api/blob-upload`, uploads directly from the browser, and then calls `/api/resources/process`. The source file never passes through the 4.5 MB Function request body.

### 4. Add frontend environment configuration

Add this variable for Production (and Preview if previews should use cloud storage):

```ini
VITE_BLOB_UPLOADS=true
```

Do not add `VITE_API_URL` for the standard same-domain Vercel deployment. The frontend will call `/api` on its own domain, which also allows the anonymous HTTP-only session cookie to work.

### 5. Deploy and verify

Deploy, then check these in order:

1. Open `/api/health`; it should return `{"status":"ok","database":"postgresql"}`.
2. Create or select a subject and upload a small text or Markdown file.
3. Confirm the source appears in **Resources** and a draft appears in **Study notes**.
4. Edit and publish the note.
5. Ask a question in **Study chat** and confirm its answer identifies the published note as its source.

Required production variables are summarized in `.env.example`. Vercel supplies `NODE_ENV` and deployment metadata automatically. Anonymous sessions are stored in PostgreSQL, so redeploying does not erase them; clearing the browser cookie creates a new anonymous library.

## Traditional Node hosting

Build with `npm run build`, then run `npm start`. The Node server serves the `dist` directory and API together. In production, place it behind an HTTPS reverse proxy and persist the `data` directory. The app uses absolute `/ocr/` asset paths. For deployment under a subdirectory, update the Vite base setting, HTML asset URLs and OCR paths in `src/SlideStudio.jsx` together.

No API key is required for the included lesson-grounded responder. This ZIP is an editable source-code deliverable; it does not change the live website.

## Verification

The export, lesson progression and local persistence tests cover new decks, editable pagination, repeated append preservation, internal package relationships, invalid inputs, study-path continuation and storage failures. Run the included test command and production build after changes. Visual browser testing of this standalone edition was not performed.
# Study_Lab
