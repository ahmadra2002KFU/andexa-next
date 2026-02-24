# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Andexa Next — a Next.js 16 rewrite of the Andexa data analysis platform. Users upload CSV/XLSX files, ask natural language questions, and get AI-generated Python code that executes against their data. The app shows analysis, code, Plotly visualizations, execution results, and commentary.

## Commands

```bash
npm run dev          # Start dev server on localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma db push   # Push schema to database (development)
npx prisma migrate dev --name <name>  # Create migration
```

**Requires a running Python executor service** at `EXECUTOR_URL` (default `http://localhost:8020`) — the parent `Agent-SIMA-3/server/` project. Code execution, file uploads, dashboard generation, and report assets all proxy through it.

## Environment Setup

Copy `.env.example` to `.env`. Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_SECRET` — Auth secret
- `GROQ_API_KEY` — Required for default LLM provider
- `EXECUTOR_URL` — Python executor service (default `http://localhost:8020`)

## Architecture

### Two-Service Split

The Next.js app handles auth, chat persistence, LLM orchestration, and the frontend. A **separate Python FastAPI service** (parent repo `server/`) handles sandboxed code execution, file storage, KPI extraction, and dashboard/report generation. The Next.js app calls it via `src/lib/executor/client.ts`.

### 3-Layer Processing Pipeline

1. **Layer 1 (LLM)**: Generates analysis + Python code via Vercel AI SDK (`streamText`). Uses tool calls to explore data before generating code.
2. **Layer 2 (Executor)**: Python code runs on the executor service against loaded DataFrames. Retry loop (`src/lib/ai/retry.ts`) feeds errors back to LLM for auto-correction (up to 3 attempts).
3. **Layer 3 (LLM)**: Generates commentary interpreting the results.

### Key Modules

- **`src/app/api/chat/route.ts`** — Main orchestrator. Streams Layer 1 via AI SDK, calls executor for Layer 2, streams Layer 3 commentary. This is the most complex file.
- **`src/lib/ai/system-prompt.ts`** — Builds the system prompt with file metadata context. Generated code must assign to `result`/`output`/`fig` variables.
- **`src/lib/ai/tools.ts`** + **`tool-handlers.ts`** — Data exploration tools (inspect columns, sample values) the LLM can call before generating code.
- **`src/lib/ai/providers.ts`** — Multi-provider setup (Groq, Z.AI, LM Studio, Ollama) using `@ai-sdk/openai`.
- **`src/lib/executor/client.ts`** — HTTP client to the Python executor. All code execution, file uploads, dashboard/report generation goes through here.
- **`src/stores/chat-store.ts`** — Zustand store managing streaming state, tool phase, and message history.
- **`src/stores/file-store.ts`** — Zustand store for uploaded file state.

### Auth

NextAuth v5 (beta) with credentials provider, Prisma adapter, PostgreSQL. Session-based auth guards all API routes.

### Database

PostgreSQL via Prisma. Schema at `prisma/schema.prisma` — models: User, Chat, Message, Rule, UploadedFile.

### Frontend Stack

- React 19, Next.js 16 App Router, React Compiler enabled
- Tailwind CSS v4, shadcn/ui components (Radix), Lucide icons
- Zustand for state, React Query for server state
- react-plotly.js for interactive charts
- Sonner for toasts

### State Management Pattern

Zustand stores (`chat-store`, `file-store`, `settings-store`) manage client state. The chat route streams responses and the frontend incrementally updates via `updateStreamingField`/`replaceStreamingField` on the chat store.

## Critical Constraints

- **Code execution happens on the Python executor**, not in Node.js. The executor expects code that uses a pre-loaded `df` variable — never `pd.read_csv()`.
- **Generated code must assign output to `result`, `output`, or `fig`/`figure`** — this is how results are captured.
- The system prompt in `system-prompt.ts` controls all LLM-generated code behavior. Changes affect everything.
- `lm_studio_client` references in the parent repo are legacy naming — it actually uses Groq API.
