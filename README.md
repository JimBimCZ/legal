# Legal Document Creator

A web app for drafting legal agreements by chatting with an AI assistant. Pick
one of 11 [Common Paper](https://commonpaper.com) templates, answer the
assistant's questions in plain language, watch the document fill in live, and
download the finished agreement as a PDF.

## What it does

- **Accounts** — email/password sign-up and sign-in, backed by a signed
  HTTP-only session cookie
- **11 document types** — NDA, Cloud Service Agreement, DPA, BAA, SLA, and more
  (see [`catalog.json`](catalog.json))
- **Chat-driven drafting** — the assistant asks for the fields a given template
  needs and extracts values from your answers; there is no manual form
- **Resumable, per-user documents** — every document and its full chat history
  is stored server-side, so you can keep several in progress and pick any of
  them back up later
- **Live preview and PDF export** — the preview updates as fields are filled;
  download unlocks once every field on the document has a value

## Quick start

Requires [Docker](https://docs.docker.com/get-docker/). Create a `.env` in the
repo root with an [OpenRouter](https://openrouter.ai) key:

```bash
echo "OPENROUTER_API_KEY=sk-or-..." > .env
```

Then start the app:

```bash
# macOS
scripts/start-mac.sh          # build the image and run the container
scripts/stop-mac.sh           # stop and remove the container

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows (PowerShell)
scripts/start-windows.ps1
scripts/stop-windows.ps1
```

The app is served at **http://localhost:8000** — frontend and API on the same
origin.

The start scripts build the image, pass `.env` in via `--env-file` (the key is
never baked into the image), and mount a named Docker volume for the database.
Without an `OPENROUTER_API_KEY` the app still runs, but the chat cannot reply.

### Your data

Accounts and saved documents live in SQLite on the `legal-app-data` Docker
volume, which survives restarts, rebuilds, and container removal. To wipe
everything and start clean, stop the container and run:

```bash
docker volume rm legal-app-data
```

## Configuration

All are optional except `OPENROUTER_API_KEY`, and all are read from the
environment (the repo-root `.env` is loaded automatically for local runs).

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — | OpenRouter credential for the chat assistant |
| `SESSION_SECRET` | a fixed dev value | Key used to sign session cookies — **set this for any real deployment** |
| `COOKIE_SECURE` | `false` | Set `true` to require HTTPS for the session cookie |
| `DATABASE_PATH` | `backend/data/app.db` | SQLite file location |
| `STATIC_DIR` | `backend/static` | Built frontend to serve; skipped if absent |
| `REPO_ROOT` | backend's parent | Where `catalog.json` and `templates/` are found |

## Architecture

```
frontend/  Next.js 16 + React 19, statically exported (output: "export")
              │  build output copied into the image as /app/static
              ▼
backend/   FastAPI (Python 3.12, managed with uv)
              ├── /api/*   JSON API
              └── /*       serves the exported frontend
           SQLite for users, saved documents, and chat messages
```

Both are packaged into a single Docker image by the multi-stage
[`Dockerfile`](Dockerfile): stage one builds the frontend with Node, stage two
runs FastAPI and serves that build. One container, one port, one origin — which
is why the frontend calls the API with relative `/api/...` paths and needs no
CORS configuration.

**Chat pipeline.** `backend/app/documents.py` parses a template's markdown into
field definitions and numbered content blocks. `document_chat.py` sends the
conversation to `openrouter/openai/gpt-oss-120b` via LiteLLM, routed to
Cerebras, using Structured Outputs against a Pydantic model generated from that
document's own fields — so the reply always comes back as valid, typed field
values. A turn is persisted only after the model call succeeds, so a failed
request leaves nothing behind and can be safely retried.

## Development

### Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload    # http://localhost:8000
uv run pytest                           # 65 tests
```

The database schema is created on first start if absent and reused afterwards.

### Frontend

```bash
cd frontend
npm install
npm run test        # 71 tests (vitest)
npm run lint
npm run build       # static export to frontend/out
```

⚠️ **`npm run dev` alone will not work end to end.** The frontend calls the API
at relative `/api/...` paths and no dev proxy is configured, so every request
from the dev server on port 3000 returns 404 and the app stops at the sign-in
screen. To exercise anything that touches data, run the full stack instead —
either the Docker scripts above, or `npm run build` followed by pointing the
backend's `STATIC_DIR` at `frontend/out`.

## API

Every route except `/api/auth/*` and `/api/health` requires a valid session
cookie.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | Create an account and start a session |
| `POST` | `/api/auth/signin` | Sign in and start a session |
| `POST` | `/api/auth/logout` | Clear the session cookie |
| `GET` | `/api/auth/me` | Current user, or 401 |
| `GET` | `/api/documents` | List the 11 available document types |
| `GET` | `/api/documents/{id}` | Parsed fields and content blocks for one type |
| `GET` | `/api/saved-documents` | The current user's saved documents |
| `POST` | `/api/saved-documents` | Start a new document from a catalog type |
| `GET` | `/api/saved-documents/{id}` | Fields and full chat history for one document |
| `POST` | `/api/saved-documents/{id}/messages` | Send a chat turn; returns the reply and updated fields |
| `GET` | `/api/health` | Health check |

`POST /api/chat` also exists — an older stateless endpoint that takes the whole
history per call. It still works but is no longer used by this frontend.

Documents are scoped to their owner; requesting one you don't own returns 404
rather than 403, so the API doesn't reveal which ids exist.

## Templates

The agreement texts in [`templates/`](templates) are the Common Paper standard
agreements, used unmodified apart from field substitution, and are licensed
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See
[`templates/LICENSE.txt`](templates/LICENSE.txt).
