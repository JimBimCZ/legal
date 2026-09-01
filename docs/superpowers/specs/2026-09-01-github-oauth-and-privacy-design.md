# GitHub OAuth, Account Deletion, and Privacy Policy

Date: 2026-09-01
Status: approved, ready for implementation planning

## Goal

Replace email/password authentication with GitHub OAuth, give users a way to
delete their own account and everything attached to it, and publish a privacy
policy that accurately describes what the app collects and who receives it.

The three are one piece of work because they share a data model: the policy has
to describe whatever the auth change leaves behind, and the erasure right it
promises is only real if the delete endpoint exists.

## Decisions taken before the design

1. **Existing production accounts are wiped.** A clean cutover, not a migration.
   GitHub OAuth is the only way in from the first deploy.
2. **Local development keeps working with zero credentials.** When GitHub OAuth
   is unconfigured, a dev-only sign-in path stands in for it, hard-gated so it
   cannot run in production.
3. **The controller is Vít Bušek personally**, contact `busek.vit@gmail.com`.
4. **No sign-up allowlist.** A $10/month cap on the OpenRouter account is the
   accepted mitigation for cost abuse. It fails closed: the chat stops replying
   when the cap is reached.

## 1. Data model

`users` is rebuilt around GitHub's identity. `hashed_password` disappears, and
with it `backend/app/security.py` and the `bcrypt` dependency.

```sql
-- SQLite
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id INTEGER NOT NULL UNIQUE,
    github_login TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Postgres
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    github_id BIGINT NOT NULL UNIQUE,
    github_login TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT {_PG_NOW}
);
```

(`{_PG_NOW}` is the interpolated constant already defined in `db.py`, not a
placeholder to fill in.)

`github_id` is the identity key, not email. GitHub emails change; the numeric id
does not. `email` is stored for display and contact but carries no UNIQUE
constraint, so a changed address on GitHub's side cannot wedge a login.

`saved_documents` and `chat_messages` are unchanged, including their existing
`ON DELETE CASCADE` references.

## 2. Legacy schema migration (destructive)

Both schema strings are `CREATE TABLE IF NOT EXISTS`, so an existing Neon
`users` table would keep its old shape forever and never gain `github_id`.

`ensure_schema` gains a one-shot legacy check that runs before the create:

- Detect: SQLite via `PRAGMA table_info(users)`, Postgres via
  `information_schema.columns`, looking for a `hashed_password` column.
- If present, drop `chat_messages`, `saved_documents`, and `users` (in that
  order for SQLite; `CASCADE` on Postgres), then fall through to the normal
  create.
- If absent — a fresh database, or one already migrated — do nothing.

The check is idempotent and fires exactly once per database. **On the first
request after deploy this deletes every production account, saved document, and
chat transcript.** That is the intended clean cutover. It also disposes of the
`smoke-1787585152@example.com` test account left in production.

## 3. GitHub OAuth flow

`POST /api/auth/signup` and `POST /api/auth/signin` are removed. `POST
/api/auth/logout` and `GET /api/auth/me` stay as they are.

### `GET /api/auth/github`

Builds `https://github.com/login/oauth/authorize` with `client_id`,
`scope=user:email`, and `state`, and returns a 302.

`redirect_uri` is deliberately omitted — GitHub falls back to the callback URL
registered on the OAuth App, which avoids an `APP_BASE_URL` env var that would
have exactly one correct value.

`state` is `secrets.token_urlsafe(32)` signed with the existing `itsdangerous`
serializer under a distinct salt (`legal-app-oauth-state`), and is *also* set as
a 10-minute HttpOnly cookie named `oauth_state`. The callback requires the query
parameter and the cookie to agree. Signing plus a matching cookie is the CSRF
defence without introducing server-side state. `SameSite=Lax` (not `Strict`) so
the cookie survives the top-level redirect back from GitHub.

### `GET /api/auth/github/callback`

1. If GitHub returned `?error=` (the user cancelled), redirect to `/?auth_error=denied`.
2. Compare `state` against the `oauth_state` cookie with `secrets.compare_digest`,
   then verify the signature with `max_age=600`. On failure, `/?auth_error=state`.
3. `POST https://github.com/login/oauth/access_token` with
   `Accept: application/json` and `{client_id, client_secret, code}`.
4. `GET https://api.github.com/user` → `id`, `login`.
5. `GET https://api.github.com/user/emails` → the address that is both `primary`
   and `verified`. If there is none, `/?auth_error=email`.
6. Upsert on `github_id`: insert a new row, or update `github_login` and `email`
   on the existing one so a renamed GitHub account stays current.
7. Set the session cookie exactly as `_set_session_cookie` does today, delete
   the `oauth_state` cookie, and redirect to `/`.

Any HTTP or parsing failure against GitHub redirects to `/?auth_error=github`.

**The callback is a top-level browser navigation, so it must never raise
`HTTPException`** — that would render raw JSON in the user's browser. Every
failure path is a redirect carrying an `auth_error` code.

`httpx` moves from a dev dependency to a runtime dependency in
`backend/pyproject.toml`.

## 4. Dev sign-in when unconfigured

`config.py` gains `get_github_client_id()`, `get_github_client_secret()`, and
`github_oauth_configured()` (both present and non-empty).

When unconfigured, `GET /api/auth/github` skips GitHub entirely: it upserts a
fixed local user (`github_id = 0`, `github_login = "local"`, `email =
"local@localhost"`), sets the session cookie, and redirects to `/`. The
quick-start in the README keeps working with no credentials at all, exactly as
it does today.

**Hard gate.** `main.py` refuses to start when the bypass is live alongside any
signal of a real deployment:

```
not github_oauth_configured() and (get_database_url() or get_cookie_secure())
    -> raise RuntimeError at startup
```

Vercel sets both `DATABASE_URL` and `COOKIE_SECURE`, so a deploy missing its
OAuth credentials fails loudly instead of shipping an open door.

A useful consequence: only **one** GitHub OAuth App needs registering, for
production. Local development never reaches GitHub.

New environment variables, both production-only: `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`.

### These must stay unset locally

Exactly one GitHub OAuth App exists, registered with the production callback
`https://legal-jimbimczs-projects.vercel.app/api/auth/github/callback`. Its
credentials are already set in the Vercel project *and* were copied into the
local `.env`.

They have to come out of `.env`. `github_oauth_configured()` returns true
whenever both are present, which suppresses the dev bypass and sends local
sign-in through a real GitHub round-trip — and GitHub would then redirect to the
production callback, so local sign-in could never complete.

Implementation step: comment out `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
in `.env` (comment, not delete, so the values stay recoverable) and leave
`OPENROUTER_API_KEY` untouched. `.env` is gitignored and untracked, so nothing
about this reaches the repository. The README must state that these two
variables are production-only and that setting them locally breaks local
sign-in.

## 5. Account deletion

`DELETE /api/auth/me`, authenticated, returns 204.

One statement — `DELETE FROM users WHERE id = ?` — followed by a commit and
`response.delete_cookie(SESSION_COOKIE_NAME)`. The existing cascades remove the
user's saved documents and every chat message under them. This works on SQLite
because `PRAGMA foreign_keys = ON` is already set in `db.py:138`, and natively
on Postgres.

## 6. Frontend

**`AuthScreen.tsx`** loses the form, the `email`/`password`/`mode` state, and the
submit handler. It becomes a single `<a href="/api/auth/github">` styled with the
existing `ui-btn ui-btn-primary` classes — a real navigation, not `fetch`, since
OAuth needs a top-level redirect. The panel, `FieldRule` mark, and wordmark are
kept as they are.

It reads `auth_error` from `window.location.search` in an effect (not
`useSearchParams`, which would force a Suspense boundary around the client-side
root page), renders the matching message in the existing
`border-l-2 border-flag` treatment, and clears the parameter with
`history.replaceState`. It also carries a line naming what is stored and linking
to `/privacy`.

Because the callback establishes the session before the page loads, `AuthScreen`
no longer calls `onAuthenticated` — the existing `fetchCurrentUser` effect in
`page.tsx` picks the session up on load. The `onAuthenticated` prop is removed,
so `page.tsx`'s `view === "auth"` branch renders `<AuthScreen />` with no props.

**`lib/authApi.ts`** drops `signUp` and `signIn`, keeps `signOut` and
`fetchCurrentUser`, and gains `deleteAccount()`.

**`types/auth.ts`** — `User` gains `github_login`, matching `UserResponse`.

**`Dashboard.tsx`** gains a quiet footer below the document list, separated by a
hairline rule: a `/privacy` link and a "Delete account" control. Deletion is a
two-step inline confirm (the button becomes "This deletes everything — confirm?"
rather than a modal), consistent with the restrained styling. On success
`page.tsx` clears `currentUser` and returns to the auth view.

**`app/privacy/page.tsx`** — a new static server component, no `"use client"`.

## 7. Privacy policy content

Reachable at `/privacy`, linked from the auth screen and the dashboard.

- **Controller** — Vít Bušek, `busek.vit@gmail.com`.
- **Collected** — GitHub numeric id, login, and verified primary email; the
  field values entered into documents, which routinely include personal data
  about third parties who never visited the site; full chat transcripts.
- **Recipients** — OpenRouter (chat content, for inference by
  `openai/gpt-oss-120b`; a transfer to the United States), Neon (database),
  Vercel (hosting and request logs), GitHub (authentication).
- **Legal basis** — performance of a contract for the account and the drafting
  service.
- **Retention** — until the user deletes their account, which is immediate and
  cascading.
- **Rights** — access, rectification, erasure (self-serve via the dashboard),
  portability, and the right to complain to the Czech DPA (ÚOOÚ).
- **Cookies** — the strictly-necessary session cookie and the short-lived
  `oauth_state` cookie, plus a `theme` preference in localStorage. No analytics,
  no third-party tracking, and therefore no consent banner. The policy says this
  plainly rather than leaving it implied.

The page must state that document content is sent to OpenRouter. That is the
disclosure a user cannot guess and the one that matters most for a tool holding
contract details.

## 8. Testing

**Backend** (`tests/test_auth.py`, rewritten). GitHub's HTTP calls are stubbed at
the `httpx` boundary:

- state mismatch between query and cookie is rejected
- expired or badly signed state is rejected
- a GitHub account with no verified primary email is rejected
- first sign-in creates a user; a second sign-in with the same `github_id`
  adopts the same row rather than creating a duplicate
- a renamed GitHub account updates `github_login` and `email` in place
- every failure path redirects with an `auth_error` code and never returns JSON
- the dev bypass issues a working session when unconfigured
- startup raises when the bypass meets `DATABASE_URL` or `COOKIE_SECURE`
- `DELETE /api/auth/me` returns 204, clears the cookie, and leaves no rows in
  `saved_documents` or `chat_messages` for that user

**Fixtures.** `conftest.py`'s `authed_client` currently signs up over HTTP; it
moves to inserting a user row and signing a session cookie directly.
`test_saved_documents.py`'s `_as_other_user` helper does the same and needs the
same treatment.

**Frontend.** `AuthScreen.test.tsx` is rewritten for the link and the
`auth_error` messages. `Dashboard.test.tsx` gains coverage of the two-step
delete. `page.test.tsx` is updated wherever it drives the old form.

## 9. Documentation

`README.md` needs: the auth description in the feature list, the environment
variable table (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, both production-only,
with a note that local runs need neither), the API endpoint table, the "Your
data" section, and a pointer to `/privacy`.

## Out of scope

- Any sign-up allowlist or per-user rate limiting.
- Vercel Deployment Protection, which remains off and is a separate decision.
- Data export as a downloadable file. Portability is honoured on request via the
  contact address; the endpoint is not built.
