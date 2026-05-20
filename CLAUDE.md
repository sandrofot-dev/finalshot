# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm start        # Production server
npm run lint     # ESLint
npx prisma migrate dev   # Apply schema migrations
npx prisma studio        # Open database GUI
npx prisma generate      # Regenerate Prisma client after schema changes
```

No test runner is configured.

## Environment Variables

Required in `.env.local`:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_URL          # e.g. http://localhost:3000
NEXTAUTH_SECRET
DATABASE_URL          # e.g. file:./prisma/dev.db
BLOB_READ_WRITE_TOKEN # Vercel Blob token — optional in dev, required in production
FAL_KEY               # FAL.ai API key — optional in dev (uses mock), required for real AI
```

`BLOB_READ_WRITE_TOKEN`: optional locally (uploads fall back to `.tmp/uploads/`). In production on Vercel: create a Blob store in the dashboard and link it.

`FAL_KEY`: get at [fal.ai/dashboard](https://fal.ai/dashboard). Without it, the job pipeline runs in mock mode. Real AI only triggers when `FAL_KEY` is set **and** the upload URL is a public blob URL (starts with `https://`).

## Architecture

This is a Next.js 14 App Router project (TypeScript, Tailwind CSS v4) for AI-powered headshot generation. The UI is in **Portuguese (pt-BR)** with a dark theme (black background, white text).

### Data Flow

1. **Upload** — `POST /api/upload` (auth required). In production saves to Vercel Blob and returns the blob URL as `uploadId`. In dev, saves to `.tmp/uploads/` and returns a local ID.
2. **Create job** — `POST /api/job` (auth required) with `{ uploadId, background }` creates a `Job` row in the database and returns `jobId`.
3. **Poll status** — Frontend polls `GET /api/job?id={jobId}` every 700ms. Progress is simulated from `createdAt` timestamp; at completion, `resultUrls` is persisted to the database and mock images are returned.
4. **Results** — `/app/results/page.tsx` shows examples gallery; `/app/upload/page.tsx` drives the full upload → background selection → job polling → result display flow.

The AI integration is **not yet implemented** — the pipeline is fully wired with mock images.

### Authentication

- **NextAuth v4** with Google OAuth only.
- Sessions stored in the database via `@next-auth/prisma-adapter`.
- `middleware.ts` protects the `/account` route.
- Session helpers: `getSession()` and `requireSession()` in `app/lib/session.ts`.

### Database

SQLite via Prisma. Schema models:
- `User`, `Account`, `Session`, `VerificationToken` — standard NextAuth adapter models.
- `Job` — `userId`, `status`, `progress`, `background`, `uploadId` (blob URL or local ID), `resultUrls` (JSON array), `createdAt`.

Prisma singleton client is in `app/lib/prisma.ts`.

### Key files

| Path | Purpose |
|------|---------|
| `app/lib/auth.ts` | NextAuth `authOptions` config |
| `app/lib/session.ts` | `getSession` / `requireSession` helpers |
| `app/lib/styles.ts` | Background style definitions (5 styles) |
| `app/api/upload/route.ts` | File upload handler; requires Node.js runtime |
| `app/api/job/route.ts` | Job creation and status polling |
| `prisma/schema.prisma` | Database schema |

### Path alias

`@/*` maps to the project root (e.g., `import { prisma } from '@/app/lib/prisma'`).
