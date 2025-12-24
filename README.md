# Website Prompt Improver (Hero)

Turn a rough website idea into a clear, structured, build‑ready prompt. Clean, fast, and focused on UX. This repo contains a minimal, production‑style hero section with an API endpoint that improves the idea deterministically (no external AI calls).

## Run locally

1) Install dependencies (first time only)

```bash
npm install
```

2) Start the dev server

```bash
npm run dev
```

3) Open http://localhost:3000

## Product overview

- Users paste messy ideas into a large textarea.
- Click "Improve my idea" (or press Ctrl/Cmd+Enter).
- Server returns a significantly improved prompt with audience, purpose, tone, sections, and features.
- Smooth reveal, loading state, copy button for fast reuse.

## Architecture

- Frontend: Next.js App Router, `app/page.tsx` (client component) builds the hero.
- Backend: API route at `app/api/improve/route.ts`.
- Styling: Tailwind v4 classes via `app/globals.css`.
- Fonts: Geist via `next/font`.

## How the improvement works

Deterministic heuristics (no external APIs):

- Extracts signals from the raw text (audience, site type, tone, features).
- Applies sensible defaults for missing info.
- Outputs a well‑structured prompt: overview, audience, goals, tone, structure, features, content/CTAs, visuals, and notes.

This keeps the experience fast, predictable, and offline‑friendly. The logic lives in `improveIdea()` in `app/api/improve/route.ts`.

## Error handling & UX

- Empty input shows an inline error.
- Loading state in the CTA button with spinner.
- Result area fades in and scrolls into view.
- Copy button writes the improved prompt to clipboard (with a fallback).

## Trade‑offs

- Pros: zero external dependencies, instant responses, deterministic output.
- Cons: heuristics won’t understand complex context like an LLM.

## What I’d improve with more time

- Swap heuristics for a real LLM (with streaming for a typewriter effect).
- Add presets (SaaS, e‑commerce, portfolio) to guide structure.
- Enhance copy/format options (Markdown export, section toggles).
- Basic analytics to learn which sections matter most.

