# Legal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The current implementation supports all 11 document types via AI chat with full user authentication and document persistence.

## Development process

When instructed to build a feature:
1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER_API_KEY in the .env file in the project root.

## Technical design

The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLLite, allowing for a users table with sign up and sign in. The schema is created on first start if absent and then reused, and the DB file lives on a Docker named volume, so accounts and saved documents persist across container restarts and rebuilds (this supersedes the original "created from scratch each time the container is brought up" behavior, which forced users to sign up again after every restart).  
Consider statically building the frontend and serving it via FastAPI, if that will work.  
There should be scripts in scripts/ for:  
```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```
Backend available at http://localhost:8000

## Color Scheme

Superseded twice - by the groovy redesign, then narrowed again by the
professional pass (see Implementation Status). The original navy, sky blue,
grape and lagoon are all retired. What is left is one accent, one alert, and a
warm neutral ramp:

- Marigold: `#ecad0a` (the sun; the only saturated fill in the interface, spent
  on the unlocked Download button, focus rings, and the sun mark)
- Sunrise ramp: `#ecad0a` → `#d38a12` → `#b8601f` → `#8f3a1a` (the four sun
  rings inside out, and the same ramp unrolled as the hairline rule)
- Brick: `#b8461f` (`#9c3512` as small text) - errors, and the dotted rule
  under an unanswered field. Nothing else
- Plum: `#2a1a23` (masthead, primary actions, outlines, offset shadows).
  Dark mode lifts the *action* to `#4e3947` so it does not vanish on a
  near-black panel, while the masthead itself goes darker
- Paper / canvas: `#fffaf2` / `#efe7d9`, rule `#ddd0bb`
- Ink / muted ink: `#2b1b24` / `#6f5f5a`

Three rules keep it coherent: one accent, so marigold appearing anywhere means
something; authority is dark rather than loud, so the primary action is plum
and a screen of controls still reads as paperwork; and a fill is never used for
small text - each accent that has to appear as a label has an `-ink` twin
clearing 4.5:1 on its own theme's paper.

## Implementation Status

### (LEG-4) Foundation
- Docker multi-stage build (Node frontend build + Python/uv backend runtime)
- Next.js frontend statically exported (`next build` with `output: "export"`) and served by FastAPI at http://localhost:8000
- FastAPI backend (`backend/`, managed with uv) with a SQLite database recreated fresh on every startup
- `users` table (id, email, hashed_password, created_at) with bcrypt password hashing
- `POST /api/auth/signup` and `POST /api/auth/signin` endpoints - no session/JWT yet; signin only verifies credentials and returns the user record
- Frontend is not yet wired to auth - no login screen or protected routes; the only user-facing feature is still the client-side Mutual NDA creator (form, live preview, PDF download)
- Start/stop scripts for Mac, Linux, and Windows (`scripts/start-*`, `scripts/stop-*`) that build and run the Docker image

### (LEG-5) AI Chat for Mutual NDA
- Added a freeform AI chat (`NdaChat`, above the form/preview) that converses with the user and populates the Mutual NDA cover-page fields from their responses - still scoped to the Mutual NDA only, not the other 10 document types in the catalog
- The existing form and preview are unchanged and now act as an editable "review/correct the AI's extraction" panel; edits in either direction (chat or form) stay in sync, and a diff-based merge on the frontend prevents a manual edit made while a chat reply is in flight from being overwritten when the reply lands
- New stateless `POST /api/chat` endpoint (`backend/app/routes/chat.py`, `backend/app/nda_chat.py`) - no auth, matching the rest of the NDA creator; takes the running chat history plus the currently-known field values and returns the assistant's next reply and its best-current understanding of every field
- LLM calls use LiteLLM via OpenRouter with Cerebras as the inference provider (`openrouter/openai/gpt-oss-120b`) and Structured Outputs (Pydantic `NdaFields` model), per the Cerebras skill
- `OPENROUTER_API_KEY` is read from the repo-root `.env` (loaded via `python-dotenv` in `backend/app/main.py` for local/dev use) and passed into the Docker container via `--env-file` in all three start scripts - the key is never baked into the image
- Still no auth or document persistence for the chat - conversation and field state live only in frontend React state, matching how the form has always worked

### (LEG-6) All Document Types
- Extended the chat, form, preview, and PDF download from the Mutual NDA only to all 11 templates in the catalog - the chat now has a document-selection phase before field collection: it asks the user which agreement they want (nudging them toward the closest catalog match if they ask for something unsupported), then only starts collecting fields once a document is confirmed
- New backend template parser (`backend/app/documents.py`) turns any of the 11 Common Paper markdown templates in `templates/` into a generic `DocumentDetail` (numbered top/nested-level blocks of text/bold/field runs) by parsing the templates' `..._link` field spans and `header_2`/`header_3` heading spans - replaces the old Mutual-NDA-only hardcoded content in `mutualNdaContent.ts`/`buildDocument.ts`, both deleted. Field keys are derived from each span's label text; Mutual NDA keeps its 4 supplemental party-name/address fields since the Standard Terms text never names the parties inline
- New `GET /api/documents` (catalog listing) and `GET /api/documents/{document_id}` (parsed detail: fields + blocks) endpoints (`backend/app/routes/documents.py`)
- `POST /api/chat` request/response now carry `selectedDocument`/`selectedDocumentName` alongside `fields`, and `fields` is a generic `dict[str, str]` keyed by each document's own field keys instead of the old fixed `NdaFields` model; `backend/app/nda_chat.py` was replaced by `backend/app/document_chat.py` (`run_chat_turn` now branches on whether a document is already selected)
- Frontend components renamed to be document-generic: `NdaChat`→`DocumentChat`, `NdaForm`→`DocumentFieldsForm`, `NdaPdfDocument`→`DocumentPdf`, `NdaPreview`→`DocumentPreview`; they now render off the parsed `DocumentDetail.blocks`/`fields` (new `frontend/src/types/document.ts`, `frontend/src/lib/documentFields.ts`, `frontend/src/lib/documentsApi.ts`) rather than a Mutual-NDA-shaped model
- `frontend/src/app/page.tsx` no longer shows the form/preview until a document is selected via chat; selecting one fetches its `DocumentDetail` from `GET /api/documents/{id}` and resets `fields`
- Docker image now also copies `catalog.json` and `templates/` into the backend runtime image (new `REPO_ROOT` env var, defaulting to the backend's parent dir, so `get_catalog_path()`/`get_templates_dir()` resolve correctly both in Docker and local dev)
- Still no auth or document persistence - conversation, document selection, and field state all still live only in frontend React state

### (LEG-7) Document Menu, Chat-Only Field Collection, Placeholder Preview, Theme Toggle
- Replaced the free-text "tell me what kind of document you want" chat phase with a clickable `DocumentMenu` grid (`frontend/src/components/DocumentMenu.tsx`) listing all 11 catalog entries via a new `fetchDocumentCatalog()` call to the existing `GET /api/documents`; picking a card is now the only way to select a document, so `document_chat.py`'s document-selection branch is no longer exercised by this frontend (still there and correct for any other client)
- Removed the manual side-by-side `DocumentFieldsForm` (deleted, along with its test) - chat is now the sole way to fill in field values, matching the ticket's "entire form filling process done in an AI chat" requirement; the right-hand panel is preview-only
- `DocumentChat` now takes a `selectedDocumentName` prop and greets with a document-specific message ("Great, let's fill in your {name}...") once a document is already selected from the menu; its `onDocumentSelected` callback signature grew a second `documentName` argument (sourced from the chat API's existing `selectedDocumentName` field) so a mid-conversation document switch updates the page's displayed name without a second lookup
- New `DocumentPlaceholder` component (a simple inline SVG) renders in the preview panel before any document is selected, replacing the old plain-text prompt
- New `ThemeToggle` component adds a manual light/dark switch (defaults to OS preference, persisted to `localStorage`, no new dependencies) alongside a no-flash inline script in `layout.tsx` that applies the resolved theme before hydration; `globals.css` switched from `@media (prefers-color-scheme)` to Tailwind v4's class-based `@custom-variant dark (&:where(.dark, .dark *))` so the toggle can override the OS preference. `ThemeToggle` reads/writes the `dark` class via `useSyncExternalStore` (not local state) specifically to resolve correctly across the static export's build-time prerender (`document` undefined, defaults to light) vs. the browser's real class at hydration
- `page.tsx`'s `handleDocumentSelected` guards against out-of-order `fetchDocumentDetail` responses (via a `useRef` selection counter) so a stale fetch from a document the user has already switched away from can't clobber newer state
- Still no auth or document persistence - unchanged from LEG-6

### (LEG-8) Multi-User Functionality
- Real session auth: `signup`/`signin` now set an HTTP-only, signed session cookie (`backend/app/session.py`, `itsdangerous`, 7-day expiry) instead of just returning the user record; new `GET /api/auth/me` (current user or 401) and `POST /api/auth/logout` (clears the cookie). `backend/app/deps.py`'s `get_current_user` dependency verifies the cookie and re-loads the user row on every request (so a cookie that outlives a DB wipe is cleanly rejected, not trusted) - every route except `/api/auth/*` and `/api/health` now requires it, including the two catalog routes and the legacy `/api/chat`
- The whole app is now auth-gated: `frontend/src/app/page.tsx` is a `loading → auth → dashboard → creator` client-side state machine (no new Next.js routes - the static export has no middleware, so this stays consistent with every prior ticket's single-page approach). New `AuthScreen` (signin/signup form) and `Dashboard` (lists the user's saved documents, reuses the existing `DocumentMenu` to start a new one) components
- Documents are now persisted server-side per user instead of living only in frontend React state: two new tables, `saved_documents` (one row per in-progress document: owner, catalog type, current field values) and `chat_messages` (append-only, one row per turn). A user can have multiple documents in progress at once and resume any of them from the dashboard
- Chat history is now server-authoritative, replacing the old client-resends-everything design: the frontend's `DocumentChat` sends only the new message's text to `POST /api/saved-documents/{id}/messages`; the backend loads persisted history, calls the existing unmodified `run_chat_turn` from `document_chat.py`, and - only once the LLM call succeeds - inserts both the user message and the assistant reply and updates the stored fields in one commit. A failed turn persists nothing, so `DocumentChat`'s retry just resends the same content with no risk of a duplicate message. This also let `DocumentChat` drop the old diff-merge-against-`sentFields` logic from LEG-5/LEG-7, since the server is now the sole writer of `fields` and each response fully replaces it
- Ownership is enforced by scoping every `saved_documents`/`chat_messages` query to the caller's `user_id`; a mismatched or missing id returns 404 either way, matching the existing signin error's "don't leak information" philosophy
- Old `POST /api/chat` (full-history-per-call) is unchanged in shape and still works (now auth-gated) but is no longer called by this frontend - left in place unedited, same as `document_chat.py`'s document-selection branch has been since LEG-7
- The SQLite DB is still wiped and recreated on every process start (unchanged, pre-existing `init_db()` behavior) - saved documents and accounts persist for the life of a running container, not across a restart/redeploy; flagged as a fast-follow, out of scope here (**resolved below - see Database Persistence**)
- Removed the now-orphaned `DocumentPlaceholder` component and the now-unused `chatApi.ts` client (superseded by `savedDocumentsApi.ts`)

### (LEG-9) Professional Redesign
- Replaced the default Next.js scaffolding look (Arial, Geist, zinc grays, no color) with a full token system built on the palette this file already specified but that no frontend code had ever actually used (`frontend/src/app/globals.css`): navy/blue/purple/yellow brand colors plus supporting `canvas`/`paper`/`line`/`ink`/`ink-muted`/`heading` neutrals, each redefined under `.dark` (dark mode now derives from navy rather than generic zinc-950)
- New type system via `next/font/google` (`frontend/src/app/layout.tsx`): Libre Caslon Display for the wordmark/section headings, Libre Caslon Text (`font-document`) for the generated document's own body copy, IBM Plex Sans for UI, IBM Plex Mono for clause numbers/timestamps/doc-type codes - all self-hosted at build time, so the static export has no runtime font dependency
- The document preview (`DocumentPreview.tsx`) is restyled as a letterhead page - navy/yellow rule under a Caslon title, bold navy-mono clause numbers, and unfilled fields shown as dotted fill-in-the-blank text instead of plain italic gray; `DocumentPdf.tsx` gets a matching treatment using react-pdf's built-in Times/Courier standard fonts (no font files to bundle, no network dependency at PDF-generation time)
- New `frontend/src/lib/documentTypeCode.ts` derives a short mono "docket code" per catalog entry (NDA, CSA, DPA, ...) keyed by filename id, shown as a chip on `DocumentMenu`/`Dashboard` cards - explicit mapping rather than derived initials, since two catalog names (Design Partner Agreement, Data Processing Agreement) would otherwise collide on "DPA"
- App header is now a solid navy masthead across every authenticated view; purple is reserved strictly for primary/submit CTAs (sign in/up, send message, new document, download PDF) per this file's original color-scheme spec
- Purely visual/presentational - no route, API, schema, or behavioral changes; all existing tests pass unmodified against the new markup/classes

### Database Persistence
- Resolves the fast-follow flagged in LEG-8: accounts and saved documents now survive a restart, a rebuild, and a container recreate, so a user signs up once and can sign in from then on
- Two independent causes had to be fixed together - fixing either alone still lost the data. (1) `init_db()` unconditionally `unlink()`ed the DB file on every process start; it now runs an all-`IF NOT EXISTS` schema script against the existing file instead. (2) The DB lived in the container's writable layer at `/app/data`, which `scripts/start-*` and `scripts/stop-*` destroy via `docker rm` on every start/stop cycle; all three start scripts now mount the named volume `legal-app-data` at `/app/data`
- No schema change and no migration path needed - the old behavior recreated the file from this same `SCHEMA_SQL` on every boot, so any pre-existing `app.db` already matches the current schema
- For a deliberate clean slate (the old behavior on demand): `docker volume rm legal-app-data` while the container is stopped
- `SESSION_SECRET` already defaulted to a fixed value rather than a per-boot random one, so existing session cookies stay valid across a restart too - no change needed there
- Guarded by `test_credentials_survive_a_restart` in `backend/tests/test_auth.py`, which boots two `TestClient` lifespans against one `DATABASE_PATH` (the in-process equivalent of a restart) and asserts signin still succeeds on the second; verified to fail with 401 against the old wiping `init_db()`
- Test isolation is unaffected: `conftest.py` points `DATABASE_PATH` at a fresh per-test `tmp_path`, so each test still starts from an empty database

### Header Download Button
- Moved "Download PDF" from the bottom of the preview column (where it sat below a full document render and was easy to miss) into the navy masthead, optically centred
- The header's `justify-between` flex became a `grid-cols-[1fr_auto_1fr]` so the button stays centred regardless of how wide the title block or signed-in email render; it only appears in the `creator` view and only once `documentDetail` has loaded
- The completeness gate itself is unchanged and pre-existing (`isDocumentComplete`, every field non-blank) - this ticket only made it visible. `DownloadButton` was restyled for a dark background (`bg-white/10`/`text-white/40` disabled, purple CTA enabled) since its old `text-ink-muted` disabled style was tuned for a light panel and nearly vanished on navy
- The old inline "Fill in all fields to enable download." paragraph became a `title` tooltip that also names how many fields are left, backed by a new `unfilledFieldCount()` in `documentFields.ts`. That helper drives the hint text only - `isDocumentComplete` remains the gate, because the two intentionally disagree on a field-less document (nothing left to fill in, but still not downloadable)
- Disabled state is a real `<button aria-disabled="true">` rather than the old inert `<span>`, so keyboard users can focus it and hear why it's blocked; `title` doubles as the accessible description, so no `sr-only` copy of the hint is needed (that would announce the reason twice)
- No `variant` prop was added: removing the preview-column copy leaves `DownloadButton` with exactly one caller, so it was restyled in place rather than made configurable for a second placement that no longer exists
- Below `lg` the masthead drops to two rows - title and actions on the first, the download button centred full-width on the second - since three columns can't fit side by side on a narrow screen. The subtitle is hidden and the title steps down to `text-lg` there too
- The breakpoint is `lg` (not `sm`) and the signed-in email is held back further still to `xl`, because those two are what actually blow the budget: going three-wide at `sm`, or showing the email at `lg`, makes the title and both action links wrap onto two lines each. Verified at 390/640/1024/1280px

### Download Gate Fix: Stand-In Field Values
- Fixes "Download PDF" unlocking on the very first chat turn with a document full of "(currently: not yet known)". The completeness gate (`isDocumentComplete`, every field non-blank) was correct and unchanged - the field *values* defeated it
- Root cause was prompt scaffolding leaking into structured output: `_field_collection_prompt` listed each field as `- Label: (currently: <value or 'not yet known'>)`, and the model copied that parenthetical verbatim into every field of the `fields` object. Non-blank strings, so the frontend read the document as complete and rendered the stand-in text into the preview and the PDF
- The prompt now lists known and missing fields as two separate sections with no copyable inline annotation, and explicitly requires `""` (not a placeholder or a stand-in phrase) for anything the user hasn't given yet
- Defense in depth, since prompt wording alone can't guarantee it: `clean_field_value()`/`clean_fields()` in `document_chat.py` normalize a stand-in value ("not yet known", "unknown", "TBD", "to be determined", ...) back to `""`. A real value wearing the `(currently: ...)` wrapper is unwrapped and kept rather than discarded. The list deliberately excludes "N/A" and "none", which can be a genuine answer to a real field
- Applied at three boundaries: the model's returned fields (write), `known_fields` on the way into `run_chat_turn` (so a poisoned document is asked about again instead of counting as answered forever), and `get_document_for_user` (read), so documents saved before this fix open as unfilled rather than only healing on the next chat message
- No frontend change - the gate was never the problem, and duplicating the stand-in list in TypeScript would just invite drift

### Groovy Redesign
- Replaced the LEG-9 navy/serif "professional" look with a 1974 poster-shop identity ("paperwork, mellowed"). The chrome is groovy - fat wonky display serif, pill controls, hard offset shadows, stacked sunset stripes - while the document preview and the PDF stay sober, so the agreement still reads as an agreement. The palette change is recorded under Color Scheme above
- **The signature is that the logo is the progress bar.** `frontend/src/components/SunMeter.tsx` draws a half-sun of four concentric rings (marigold, ember, grape, lagoon, inside out); `DocumentPreview` passes it the live filled/total field count so the sun rises as the chat answers fields, and once it is full `DownloadButton` turns the sun's own marigold. The same mark, all rings lit, is the wordmark in the masthead, the arch on the sign-in card, and the loading state; the four-stripe rule along the bottom of the masthead is that sun unrolled, and the PDF letterhead repeats it
- Ring lighting is deliberately not linear: none until the first field is answered, at most three while any field is outstanding, all four only at complete - so a nearly-done document never looks finished
- One variable font family covers both registers (`frontend/src/app/layout.tsx`): Fraunces with the `SOFT`/`WONK`/`opsz` axes, driven from `.type-display` (`opsz 144, SOFT 100, WONK 1`, weight 800) for the chrome and `.type-doc` (`opsz 10, SOFT 0, WONK 0`) for the contract body. Jost (Futura-ish geometric) is the UI sans, Space Mono the utility face for clause numbers, docket codes, timestamps, and eyebrow labels. All self-hosted at build time via `next/font/google`, so the static export still has no runtime font dependency
- Shape language lives in `globals.css`'s `components` layer (`.groove-panel`, `.groove-btn`, `.groove-input`, `.groove-card`, `.groove-chip`, `.groove-eyebrow`, `.groove-link`) so per-instance Tailwind utilities always win over the base. `.groove-shell` (the masthead) re-points `--color-pop`, the hard-shadow colour, rather than every control on it needing its own dark-ground variant
- Each catalog type keeps one of the four accent colours for the life of the app, hashed from its id in `lib/cardStyles.ts` (`cardAccent`) - so the same NDA is orange on the catalog grid and orange again on the dashboard. Full literal class strings, since Tailwind only sees classes it can find in the source
- Blanks in the preview are now dotted ember rules rather than plain grey italics, so what is left to answer is findable at a glance in a long document
- Purely visual - no route, API, schema, or behavioural change. All 71 existing frontend tests pass unmodified; the copy they assert on ("Your Documents", "+ New Document", "{name} Details", "Document Preview") was kept verbatim and the voice work went into the untested supporting copy

### Professional Pass
- Keeps the groovy identity - warm paper, Fraunces, hard offset shadows, and
  the logo-as-progress-meter signature - but takes roughly a third of the
  poster-shop maximalism back out of it. The palette change is recorded under
  Color Scheme above
- **Four rotating accents became one.** Grape and lagoon are gone; the four sun
  rings are now a single warm ramp (a sunrise, not a colour wheel) and the same
  ramp is the hairline rule under the masthead, the page heading, and the
  sign-in card. `SunRule` lives in `SunMeter.tsx` beside the mark itself, so
  the two can't drift apart - it used to be three hand-written copies of the
  stripe in three components
- **The primary action is plum, not orange.** `--color-action` is its own token
  rather than an alias of `--color-shell`, because dark mode has to lift it
  (`#4e3947`) to keep it from disappearing into a near-black panel while the
  masthead goes the other way. The chat's own-message bubble uses the same
  token for the same reason. Marigold as a fill is now confined to the unlocked
  Download button, so completion is the only place in the app that goes bright
- **`.groove-eyebrow` is muted, not accented.** Every section label on every
  screen used to be brick; making them ink-muted is the single largest colour
  reduction, and it is what lets the accent still mean something
- Shape and weight dialled back throughout: 26px panels → 12px, pill buttons
  and inputs → 8px, 2px borders → 1.5px, 5px/3px offset shadows → 3px/2px,
  chat bubbles from `rounded-3xl` to `rounded-lg`, the sign-in card's
  150px arch to a 40px shoulder with a proper header band
- `.type-display` runs Fraunces at `SOFT 30, WONK 0, opsz 72, weight 700`
  instead of `SOFT 100, WONK 1, opsz 144, weight 800` - still recognisably
  Fraunces, no longer a poster. `layout.tsx` still requests the WONK axis: the
  `font-variation-settings` declaration needs it loaded even to set it to 0
- New `.groove-btn-quiet` for controls that must not outweigh a primary beside
  them; the dashboard's toggle now uses it in its "Cancel" state, having
  previously rendered the dismiss action as the heaviest button on the page
- `cardStyles.ts` lost `cardAccent` entirely. Cards are uniform and the mono
  docket chip is an outlined stamp rather than a coloured pill - the code
  already identified the type, so the colour was carrying no information the
  label wasn't, and eleven cards in four hues read as a paint chart
- Fixed a pre-existing typographic defect the flatter design made obvious:
  almost every clause rendered as "Term and Termination. . This MNDA…". The
  templates put the period after a clause heading *outside* the bold span, so
  the parser's `heading` stops short of it and the block's first run opens with
  ". " - and both the preview and the PDF appended one of their own. New
  `lib/clauseHeading.ts` returns the separator to use (`""`, `" "`, or `". "`)
  by looking at both sides, covering templates that put the period either way.
  Guarded by `clauseHeading.test.ts`
- Purely visual apart from that fix - no route, API, or schema change. All 71
  pre-existing frontend tests pass unmodified (75 with the new ones)

### Template Trailer Fix (backend parser)
- Fixes the Common Paper attribution footer rendering *inside* the agreement.
  `Mutual-NDA.md` ends with an unindented paragraph carrying its own licence
  notice; because a top-level item's body otherwise runs to end of file, that
  paragraph was swallowed by clause 11 and rendered into the contract with its
  markdown link syntax intact ("...free to use under \[CC BY 4.0\](https://...)")
- `_LIST_TRAILER` in `backend/app/documents.py` encodes the rule that ends a
  numbered list: a blank line followed by unindented, un-numbered text. Applied
  per top-level item (not by truncating the whole document at the first match)
  so a hypothetical mid-document paragraph would cost that paragraph rather
  than everything after it
- The notice is **moved, not dropped** - CC BY requires it be retained, so
  `_plain_text` flattens its markdown/angle links to readable prose and
  `parse_template` appends it to `sourceAttribution`, which already renders in
  small print below a rule in both the preview and the PDF
- Mutual-NDA.md is the only one of the 11 templates that ends on anything but a
  list item, and `test_no_other_template_has_a_trailer_to_strip` asserts that
  stays true - if a future template gains a trailer, that test fails rather
  than the parser silently swallowing content
- Guarded by `TestListTrailer` plus two real-catalog tests; verified to fail
  (3 tests) against a neutered `_LIST_TRAILER`. Backend suite is 86 passing

### Current API Endpoints
- `POST /api/auth/signup` - Create account, set session cookie, return user record
- `POST /api/auth/signin` - Verify credentials, set session cookie, return user record
- `POST /api/auth/logout` - Clear the session cookie
- `GET /api/auth/me` - Current authenticated user, or 401
- `GET /api/saved-documents` - List the current user's saved documents (id, catalog type, timestamps)
- `POST /api/saved-documents` - Create a new saved document for the current user from a catalog type id; seeds the greeting message
- `GET /api/saved-documents/{id}` - Full detail (fields + chat history) for one of the current user's saved documents; 404 if missing or not owned
- `POST /api/saved-documents/{id}/messages` - Send a chat message for a saved document; persists the turn and returns the assistant's reply, resolved document type, and updated fields
- `POST /api/chat` - (Auth-gated, legacy/unused by this frontend since LEG-8) Freeform AI chat turn; before a document is selected it helps the user pick one of the 11 catalog documents, then collects that document's fields - returns the assistant's reply, the selected document (if any), and its current understanding of all of that document's fields
- `GET /api/documents` - List the 11 available document types from the catalog
- `GET /api/documents/{document_id}` - Parsed detail for one document type (fields + numbered content blocks) for rendering the form/preview/PDF
- `GET /api/health` - Health check

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
