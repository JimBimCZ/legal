# Mutual NDA Creator

A prototype web app for generating a Mutual Non-Disclosure Agreement. Fill in
the cover-page details (parties, purpose, dates, governing law) and get a
live preview of the completed agreement, downloadable as a PDF.

Everything runs client-side — there's no backend or persistence.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How it works

- `src/lib/mutualNdaContent.ts` holds the cover-page field definitions and
  the Standard Terms clauses (transcribed from
  [`templates/Mutual-NDA.md`](../templates/Mutual-NDA.md) at the repo root),
  with `{{fieldKey}}` placeholders marking where form values get inserted.
- `src/lib/buildDocument.ts` interpolates form values into that content,
  producing a single document model consumed by both the on-screen preview
  (`NdaPreview`) and the downloadable PDF (`NdaPdfDocument`, rendered via
  [`@react-pdf/renderer`](https://react-pdf.org)).

The Standard Terms are the Common Paper Mutual Non-Disclosure Agreement,
Version 1.0, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
