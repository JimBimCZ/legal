# Frontend

The UI for the Legal Document Creator — see the [root README](../README.md) for
what the project is and how to run the whole stack.

Next.js 16 (App Router) + React 19 + Tailwind v4, **statically exported** and
served by the FastAPI backend. There are no server components, route handlers,
or middleware at runtime: `next build` with `output: "export"` emits plain
files that the backend serves.

## Commands

```bash
npm install
npm run test          # vitest, 71 tests
npm run test:watch
npm run lint
npm run build         # static export to ./out
```

### Running it

⚠️ **`npm run dev` on its own will not get you past the sign-in screen.** Every
API call uses a relative `/api/...` path and no dev proxy is configured, so on
port 3000 they all 404. A rewrite would fix the dev server but wouldn't carry
into the exported build, which has no server to rewrite anything.

To actually use the app, run the full stack — the Docker scripts in
[`scripts/`](../scripts) — and open http://localhost:8000. Use `npm run dev`
only for work that doesn't touch the API.

## How it's put together

The whole app is one client-side route (`src/app/page.tsx`) driving a
`loading → auth → dashboard → creator` state machine. A static export has no
middleware to gate routes with, so auth is enforced by the backend on every
request and reflected in that state rather than in the URL.

| Path | Role |
| --- | --- |
| `src/app/page.tsx` | The state machine, and owner of document/field state |
| `src/components/AuthScreen.tsx` | Sign in / sign up |
| `src/components/Dashboard.tsx` | The user's saved documents |
| `src/components/DocumentMenu.tsx` | Grid of the 11 catalog types |
| `src/components/DocumentChat.tsx` | The conversation; the only way fields get filled |
| `src/components/DocumentPreview.tsx` | Live letterhead-style preview |
| `src/components/DocumentPdf.tsx` | The same document via `@react-pdf/renderer` |
| `src/components/DownloadButton.tsx` | Header CTA; gated on the document being complete |
| `src/lib/*Api.ts` | `fetch` wrappers, one per backend area |
| `src/types/` | Shared response shapes |

**Documents are data, not code.** The backend parses each markdown template into
field definitions and numbered content blocks; the preview and the PDF both
render from that same `DocumentDetail`. Nothing here hardcodes the text or the
fields of any particular agreement.

**The server owns chat state.** `DocumentChat` sends only the new message and
replaces its fields wholesale from the response — it never merges or re-sends
history. A failed turn persists nothing server-side, so retrying just resends
the same text without risking a duplicate.

## Styling

Design tokens live in `src/app/globals.css` — brand navy/blue/purple/yellow plus
`canvas`/`paper`/`line`/`ink` neutrals, each redefined under `.dark`. Dark mode
is class-based (Tailwind v4 `@custom-variant`) so `ThemeToggle` can override the
OS preference, with an inline script in `layout.tsx` applying the stored theme
before hydration to avoid a flash.

Fonts are loaded via `next/font/google` and self-hosted at build time, so the
export has no runtime font dependency: Libre Caslon Display (headings), Libre
Caslon Text (document body), IBM Plex Sans (UI), IBM Plex Mono (clause numbers,
timestamps, doc-type codes).

## Tests

Vitest + Testing Library, colocated as `*.test.tsx`. `@react-pdf/renderer` is
stubbed in `DownloadButton.test.tsx` (it needs workers and Blob URLs that jsdom
lacks); `DocumentPdf.test.tsx` separately exercises the real PDF pipeline in a
node environment.
