# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuantDash is an A-share (China stock market) analytics dashboard — a single-page Vite + React + TypeScript frontend with a FastAPI Python backend and a fleet of Python data-collection scripts. It provides market sentiment tracking, stock screening, limit-up ladder analysis, sector rotation, AI-assisted review/planning, and a local MCP server for structured data access by external AI.

## Commands

### Frontend

```bash
npm run dev          # Start Vite dev server on port 3000
npm run build        # Production build
npm run typecheck    # tsc --noEmit (note: tsconfig excludes tushareService.ts)
npm run lint         # ESLint on components/ and services/
```

### Project Lifecycle

```bash
npm run start:project   # Unified startup (Vite + Python backend + scheduled syncs)
npm run stop:project    # Graceful shutdown
```

### Data Sync (Node orchestration → Python execution)

```bash
npm run fetch:data        # Main post-market sync (market core + stocks + sectors + cycle)
npm run sync:all          # Full sync with retries, continues on stage failure by default
npm run sync:market:py    # Market core snapshots only
npm run sync:kline:py     # K-line library sync (rolling window, skips already-updated symbols)
npm run sync:cycle:py     # Sentiment cycle snapshots
npm run sync:stocks:py    # Stock snapshots
npm run sync:sectors:py   # Sector snapshots
npm run sync:offline:py   # Complete offline snapshot pipeline (market + stocks + sectors + kline + emotion + cycle)
npm run sync:emotion      # Cross-market emotion indicators
npm run sync:reports      # Research report scraping from EastMoney
npm run sync:experts      # Expert holding snapshots from CSV files
npm run sync:startup-check # Lightweight pre-flight data freshness check
```

Key sync env vars: `STARTUP_AUTO_SYNC`, `STARTUP_SYNC_MODE` (startup|market|offline), `FULL_SYNC_INCLUDE_KLINE`, `KLINE_RECENT_LIMIT`, `KLINE_FORCE_FULL`, `SYNC_STAGE_RETRIES`, `SYNC_STAGES`.

### Backend & Integrations

```bash
pip install -r requirements.txt   # Python dependencies (httpx, fastapi, pandas, etc.)
npm run mcp:server                # Start local stdio MCP server for AI data access
npm run feishu:bot                # Start Feishu/Lark bot (WebSocket long-connection, no public URL needed)
```

## Architecture

### Data Flow (mandatory convention)

```
External sources / Python scripts / Backend APIs / Local files
  → Structured cleaning
  → data/*.json or service-layer objects
  → services/*
  → components/*
  → AI / MCP / other integrations (reuse same structured objects)
```

**Hard rule from STRUCTURED_DATA_RULES.md:** Every new UI data type must go through this pipeline. Components must not directly fetch external data, parse HTML, or derive business logic. AI must read structured objects, not page DOM.

### Frontend Architecture

- **Entry:** `index.html` → `index.tsx` → `App.tsx`
- **Routing:** Tab-based SPA with lazy loading (`React.lazy`). Inactive tabs use CSS `hidden` (not unmounted) to preserve state.
- **Component pattern:** Large sections follow `container → hook → panel` decomposition:
  - `components/<section>/` contains:
    - Section shell (e.g., `SentimentSection.tsx`)
    - `hooks/` — data fetching, state management, workflow logic (e.g., `useSentimentDataLoaders.ts`)
    - `panels/` — pure presentational sub-views (e.g., `SentimentEmotionPanel.tsx`)
    - `config.tsx` — section-specific constants and configuration
- **Types:** All shared types live in `types.ts` (Stock, DataFreshnessMeta, DataSourcePolicyState, SentimentData, etc.)
- **Path aliases:** `@/` maps to project root (configured in both `tsconfig.json` and `vite.config.ts`)
- **Styling:** Tailwind CSS with dark/light theme via CSS class toggle on `<html>`. Dark mode is default.

### Services Layer (frontend `services/`)

Every service file represents a data domain. Key services:
- **`localDataService.ts`** — reads `data/*.json` files (the canonical data access point)
- **`dataPathService.ts`** — path compatibility layer: tries `data/markets/a_share/` first, falls back to old `data/*.json`
- **`eastmoneyService.ts`** — proxies EastMoney requests through local Python server, with dedup/cache/cool-down/retry
- **`chanService.ts`** — Chan Theory (缠论) structure calculation: containment, fractals, strokes, segments, pivots
- **`dataSourcePolicyService.ts`** — dual-source policy management (primary = EastMoney, secondary = mootdx)
- **`sectorService.ts`** — sector rotation and persistence analysis
- **`sentimentCycleService.ts`** — sentiment cycle data reader
- **`skillLibraryService.ts`** — user-defined AI analysis rule library

### Python Backend (`scripts/server/`)

- **`app.py`** — FastAPI app assembly: CORS, lifespan (scheduler startup), router registration
- **`modules/`** — domain routers: `auth`, `eastmoney`, `eastmoney_actions`, `eastmoney_refresh`, `github_updates`, `integrations`, `screener*`, `skill_library`, `sync_runtime`, `watchlist`
  - Action files (e.g., `screener_market_data.py`, `screener_kline_data.py`) handle heavy logic — routers stay thin
- **`shared/`** — infrastructure: `cache.py` (Redis/memory dual-mode), `db.py` (SQLite WAL, connection pooling), `api.py` (request context middleware, error handlers), `runtime.py` (lifespan management)

### Data Collection Scripts (`scripts/*.py`)

Standalone Python scripts for batch data collection. Each writes structured JSON to `data/`. Key scripts:
- `fetch_market_core_snapshots.py` — limit-up pools, market breadth, index snapshots
- `fetch_sentiment_cycle_snapshots.py` — sentiment cycle computation
- `fetch_kline_library.py` — K-line historical data (rolling window, incremental)
- `fetch_emotion_indicators.py` — cross-market emotion indicators
- `fetch_research_reports.py` — EastMoney research report scraping with dedup

### Data Directory Structure (migration in progress)

```
data/
  markets/a_share/     # New canonical path (klines/, single_day_snapshots/, *.json)
  research_reports/a_share/   # New report path
  system/              # sync_status.json, auth.db
  *.json               # Legacy path (still supported via fallback in dataPathService)
```

All code reads new path first, falls back to old. Write paths are new-path-only.

### Dual Data Source Architecture

- **Primary:** EastMoney (via Python proxy — browser never calls EastMoney directly)
- **Secondary:** mootdx (K-lines, basic quotes, market breadth, index series)
- **Policy:** `dataSourcePolicyService.ts` manages global mode + per-dataset overrides (`primary_only`, `auto_fallback`, `prefer_secondary`). Switching logic lives in Python, not in frontend.
- Datasets exclusive to primary source: limit-up/broken/down-limit pools, sector rankings, A-share average valuation, index futures

### MCP Server (`scripts/mcp-server.js`)

Stdio-based MCP server exposing 12 tools for structured market data access. External AI should use these tools rather than parsing page DOM. Tools include: `get_market_dashboard`, `get_sentiment_snapshot`, `get_leader_state`, `get_sector_persistence`, `get_cycle_overview`, `get_volume_trend`, `get_high_risk_panel`, `get_news_feed`, `get_research_reports`, `get_research_report_content`, `get_expert_holding_snapshots`, `get_expert_holding_snapshot`.

### Skills System

User-defined AI analysis rules stored in browser localStorage, injected into AI review, premarket plan, stock observation, and report summary workflows. Skills define output structure, risk preferences, review methodology — not raw data. Managed via `SkillsSection.tsx` and `skillLibraryService.ts`.

### mxDataSource (`mxDataSource/`)

A bundled sub-project containing Claude Code skills for EastMoney financial data APIs. See `mxDataSource/CLAUDE.md` for its own architecture. When working on the main dashboard, this directory can be ignored unless integrating mx-skills into the dashboard's AI workflows.

## Key Constraints

- **License:** PolyForm Noncommercial 1.0.0 — no unauthorized commercial use
- **No secrets in code:** `.env.local` (gitignored), `.env.example` (template) pattern
- **Python for collection, Frontend for display, Node for orchestration** — only deviate when clearly superior
- **Immutability:** Prefer creating new objects over mutation (per project coding standards)
- **Data sources:** Never add direct EastMoney requests in browser code — route through Python proxy
- **Auth:** `scripts/server/modules/auth.py` handles login rate-limiting, password strength, and permission checks
