# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Yalimpi — a cleaning-service booking app for hosts (Airbnb-style turnovers) in Medellín. A host submits a cleaning request via a form, an admin assigns a cleaner and tracks status, and completion photos get attached to the request.

## Commands

```
npm start        # runs `node server.js`, serves the app on PORT (default 3000)
```

There is no build step, bundler, test suite, or linter — this is a plain Node/Express backend serving static HTML/CSS/JS from `public/`. Just run the server and reload the browser.

## Architecture

**Single-file backend.** All server logic lives in `server.js`: Express app, all routes, and the JSON "database" read/write. There's no ORM, no separate models/controllers/routes split — everything is inline.

**Storage is a flat JSON file, not a real database.** `requests.json` holds `{ rates, addOnPrices, requests: [] }` and is read fully into memory and rewritten (`JSON.stringify(db, null, 2)`) on every mutating request. There's no locking — concurrent writes can race. Uploaded completion photos go to disk via multer's `diskStorage`, filenames are `<timestamp>-<random>.<ext>`.

**Data directory resolution (`resolveDataDir()` in server.js) is environment-dependent**: it tries `/data` first (a persistent volume mounted on Railway in production) and falls back to `./data` locally if `/data` isn't writable. `requests.json` and `uploads/` always live under whichever `DATA_DIR` gets picked — don't hardcode paths to either location.

**Data model migrations happen lazily at the field level, not via migration scripts.** Example: `photoUrls` (array, max 6) replaced the older single `photoUrl` field. Old records aren't rewritten in bulk — a helper (`getPhotoUrls()`) normalizes old-shape records on read, and a record is only fully migrated to the new field the next time it's actually written (e.g. on its next photo upload). Follow this same pattern for any future field changes: normalize-on-read + migrate-on-write, no destructive one-off scripts against `requests.json`.

**Three static pages in `public/`, no framework, no shared JS between them** — each is a self-contained HTML file with inline `<style>` and `<script>`:
- `index.html` — public marketing/landing page (WhatsApp is the primary booking CTA, linking to a `wa.me` deep link — there's no WhatsApp Business API integration, just click-to-chat)
- `host.html` — the booking form hosts fill out; posts to `POST /request`
- `admin.html` — password-protected dashboard; polls `GET /requests`, mutates via `PUT /requests/:id` and `POST /requests/:id/photo`

**Admin auth is HTTP Basic Auth via `requireAdminAuth` middleware, gated on `ADMIN_PASSWORD`.** It's registered on `/admin.html` and `/requests` *before* `express.static('public')` — that ordering is load-bearing: if `express.static` were registered first, it would serve `admin.html` directly and the auth middleware would never run. Keep any new admin-only route registered before the static middleware, same pattern.

**Pricing is computed server-side** in `POST /request` from `db.rates[propertyType]` plus `db.addOnPrices` (currently just `laundry`), not trusted from the client.

**Dark theme is hand-rolled CSS repeated per-file** (`admin.html`, `host.html`) — there's no shared stylesheet or design tokens file, so matching an existing look means copying the relevant class patterns (e.g. `#121212` background, `#0F9D8C` accent, `#3fd6c0` teal) from the nearest existing page rather than introducing new colors.

## Preferences

- Prices display as `COP$` with Colombian thousands-separators (e.g. `COP$55.000`), via `Intl.NumberFormat('es-CO', ...)` — see `formatCOP()` in `admin.html`/`host.html`.
- UI text is bilingual: English primary, Spanish secondary (e.g. `Checkout Time <span class="es">(Hora de Salida)</span>`).
- Dark theme, teal `#0F9D8C` accent.
- Commit messages: short, single-line, no co-author footers.

## Engineering Principles

*Field notes on getting a language model to write code you will not rewrite — Andrej Karpathy*

Language models make predictable mistakes when they write code. Not random mistakes, just the same ones, over and over, often enough that it was worth writing them down. What follows is not a set of suggestions but a set of rules. The throughline is the same in every section: the model is fast at generating plausible code and slow to notice that plausible is not the same as correct, so the discipline has to come from the process around it.

### I. Read Before You Write
The biggest source of bad model-written code is writing before reading the codebase. Read the files you are about to touch; read, not skim. Copy the patterns that already exist, and check the imports to see what the project actually depends on, so you do not reach for axios where everything is fetch. When you cannot find a pattern, ask instead of guessing.

### II. Think Before You Code
Figure out what you are doing before you type. State your assumptions ("add authentication" is five different things, so name the one you picked) and name the tradeoffs. If something is genuinely confusing, stop and ask rather than filling the gap with plausible-looking code; that is exactly the code that passes a casual review and fails when it matters.

### III. Simplicity
Write the minimum code that solves the problem in front of you now, not the minimum that could solve every future version of it. Resist premature abstraction, skip error handling for errors that cannot occur, and hardcode values until there is a real reason to configure them. The test: if the only reason something is abstracted is "in case we need to," you have over-built it.

### IV. Surgical Changes
Your diff should be as small as the task allows. Do not touch what you weren't asked to touch, match the existing style, and do not reformat; a formatter pass buries the three lines that matter inside three hundred that do not. The test is whether you can justify every changed line by the task. If a line is there because "while I was in there," revert it.

### V. Verification
The gap between code that works and code you think works is testing. When fixing a bug, write the failing test first, watch it fail, then fix it; that is the only proof you fixed the cause and not the symptom. Test behavior that can actually break, not that a constructor sets a field. If something is hard to test, that is information about the design, not permission to skip it.

### VI. Goal-Driven Execution
Every task needs a success criterion before code is written. "Add validation" becomes "reject a missing or malformed email, return 400 with a clear message, and test both cases." For anything multi-step, state the plan first so the user can catch a wrong approach before you spend an hour building it.

### VII. Debugging
When something breaks, investigate; do not guess. Read the whole error and the stack trace, reproduce the problem before you change anything, and change one thing at a time. Do not paper over an unexpected null with a null check; find out why it is null, or the bug just moves somewhere quieter.

### VIII. Dependencies
Every dependency is permanent code you do not control. Before adding one, ask whether the project or the standard library can already do it — `crypto.randomUUID()` over a uuid package. When you do add one, say why, so the choice is visible rather than smuggled into the manifest.

### IX. Communication
Say what you did and why, not just a block of code. Flag concerns even when you did exactly what was asked, and be precise about uncertainty: "I am not sure this library supports streaming" tells the user what to verify; "I think this should work" does not.

### X. Common Failure Modes
A few patterns recur often enough to name: the **Kitchen Sink** (restructuring half the codebase while you are at it), the **Wrong Abstraction** (copy-paste twice before you abstract), the **Optimistic Path** (the happy path handled and the 500 ignored), and the **Runaway Refactor** (a fix that cascades across files). Catch yourself in any of these and the right move is to stop, not to push through.
