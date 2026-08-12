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
The database should use SQLLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
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
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

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
- The SQLite DB is still wiped and recreated on every process start (unchanged, pre-existing `init_db()` behavior) - saved documents and accounts persist for the life of a running container, not across a restart/redeploy; flagged as a fast-follow, out of scope here
- Removed the now-orphaned `DocumentPlaceholder` component and the now-unused `chatApi.ts` client (superseded by `savedDocumentsApi.ts`)

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
