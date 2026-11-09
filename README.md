# Study Lab — React JavaScript source

A standalone React + Vite version of your Study Lab website. All application code is JavaScript (`.js`) and JSX (`.jsx`); no TypeScript compilation or backend is required.

## Start on your computer

Install Node.js 22.13 or newer, extract this ZIP, and open the `study-lab-react` folder in VS Code. In its terminal, run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173). Do not open `index.html` directly from the file manager.

```bash
npm test          # Export and progress regression tests
npm run build     # Create the production dist folder
npm run preview   # Preview that build locally
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

## Storage and scope

This downloadable edition saves subject names, progress and preferences in browser localStorage, and photo drafts in IndexedDB. It does not sign in, sync across devices, or use the hosted website's database. Keep downloaded presentations as backups; clearing browser site data removes local progress and drafts. Previously selected base PowerPoint files must be selected again after a reload.

Custom subjects have photo and presentation workspaces. The supplied guided lessons, flashcards and quizzes are specifically for Programming Languages; new subjects do not automatically get AI-generated study content. Add your own lesson data in `src/content.js` when extending the app.

OCR is text recognition, not generative AI. Review results, especially equations, code, handwriting and unclear photos. Diagrams stay inside the source photo; they are not converted to editable shapes. English and Myanmar models are bundled, with no OCR API key required. Fonts optionally load from Google Fonts; system fonts are used if unavailable. Install Myanmar fonts locally for best PowerPoint rendering.

Limits: 40 photos per batch, 15 MB per photo, 40 MB for a base PowerPoint, and 200 MB for its uncompressed package. Uploaded photos are resized to a maximum dimension of 2200 px.

## Hosting

Build with `npm run build`, then serve the `dist` directory from an HTTPS web server at the domain root. The app uses absolute `/ocr/` asset paths. For deployment under a subdirectory, update the Vite base setting, HTML asset URLs and OCR paths in `src/SlideStudio.jsx` together.

No environment variables, API keys or private server configuration are required. This ZIP is an editable source-code deliverable; it does not change the live website.

## Verification

The export, lesson progression and local persistence tests cover new decks, editable pagination, repeated append preservation, internal package relationships, invalid inputs, study-path continuation and storage failures. Run the included test command and production build after changes. Visual browser testing of this standalone edition was not performed.
# Study_Lab
