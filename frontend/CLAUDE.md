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

### Current API Endpoints
- `POST /api/auth/signup` - Create new user account
- `POST /api/auth/signin` - Verify credentials, return user record (no session/JWT)
- `POST /api/chat` - Freeform AI chat turn for the Mutual NDA creator; returns the assistant's reply plus its current understanding of all cover-page fields
- `GET /api/health` - Health check
