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

### Current API Endpoints
- `POST /api/auth/signup` - Create new user account
- `POST /api/auth/signin` - Verify credentials, return user record (no session/JWT)
- `POST /api/chat` - Freeform AI chat turn; before a document is selected it helps the user pick one of the 11 catalog documents, then collects that document's fields - returns the assistant's reply, the selected document (if any), and its current understanding of all of that document's fields
- `GET /api/documents` - List the 11 available document types from the catalog
- `GET /api/documents/{document_id}` - Parsed detail for one document type (fields + numbered content blocks) for rendering the form/preview/PDF
- `GET /api/health` - Health check
