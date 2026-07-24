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
