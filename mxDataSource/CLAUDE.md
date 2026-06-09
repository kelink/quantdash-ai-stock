# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repo is a collection of Claude Code skills (`mx-skills/`) that provide financial data querying, analysis, and report generation capabilities. All skills are backed by the Eastmoney (东方财富) financial database via internal APIs at `https://ai-saas.eastmoney.com/proxy/`.

## Architecture: Two Skill Patterns

### Pattern 1: Single-Script Query (most skills)

The skill's `scripts/get_data.py` accepts `--query` and optional parameters, calls the API, and writes output files. The SKILL.md instructs Claude how to invoke it. Used by: `mx-finance-data`, `mx-finance-search`, `mx-macro-data`, `mx-stocks-screener`, `mx-personal-kb-search`, `stock-diagnosis`, `fund-diagnosis`, `comparable-company-analysis`, `industry-research-report`, `stock-market-hotspot-discovery`, `topic-research-report`.

### Pattern 2: Multi-Step Orchestration

The SKILL.md defines a sequence of script calls that the LLM must execute in order, making decisions between steps. Used by:

- **stock-earnings-review**: `validate_entity.py` → `normalize_report_period.py` → (LLM selects reportDate) → `call_review_api.py`
- **mx-financial-assistant**: Single `generate_answer.py` but with deep-think mode toggle
- **initiation-of-coverage-or-deep-dive**: Single `generate_deep_research_report.py` that internally chains entity recognition + report generation
- **industry-stock-tracker**: Single `generate_industry_stock_tracker_report.py`

## Key Conventions

### SKILL.md metadata
Every skill has a SKILL.md with YAML frontmatter (`name`, `description`). The `description` field is the primary trigger mechanism — Claude uses it to decide when to invoke the skill.

### Script invocation
All SKILL.md files use `{baseDir}` as a placeholder for the skill's root directory. When invoking a script, replace `{baseDir}` with the actual path, e.g.:
```bash
python3 /home/link/githubPrj/mxDataSource/mx-skills/mx-finance-data/scripts/get_data.py --query "..." --indicators "..."
```

### Authentication
- API key via environment variable `EM_API_KEY` (default: `em_S5Ffen9gkfzo42vG2kiUBLE0UXiYyp4Y`)
- Shared auth helper is in `mx-skills/stock-earnings-review/scripts/common.py` (`auth_headers()`, `base_headers()`)
- Each skill's scripts handle auth independently; there is no shared library across skills

### Output directory convention
Default output root: `./miaoxiang/<skill_slug>/` relative to current working directory. Individual skills may override via environment variables (e.g., `MX_MACRO_DATA_OUTPUT_DIR`, `STOCK_EARNINGS_REVIEW_OUTPUT_DIR`).

### Output formats by skill type
| Skill type | Output format |
|---|---|
| Data queries (mx-finance-data) | `.xlsx` + `.md` |
| Screeners (mx-stocks-screener) | `.csv` + `_description.txt` |
| Macro data (mx-macro-data) | `_<frequency>.csv` + `_description.txt` |
| Search (mx-finance-search, mx-personal-kb-search) | `.txt` or `.md` |
| Reports (coverage, industry, earnings, topic) | `.pdf` + `.docx` + markdown content |
| Hotspot discovery | `.md` |

### Math formula format
All skills that produce markdown output MUST use `\(...\)` for inline and `\[...\]` for display math (not `$...$`).

## Skill Inventory

| Skill | Slug | Type | Key Script(s) |
|---|---|---|---|
| All-Market Financial Data Hub | `mx-finance-data` | Data query | `scripts/get_data.py --query ... --indicators ...` |
| Financial Search Engine | `mx-finance-search` | Search | `scripts/get_data.py "query"` |
| Global Macro Database | `mx-macro-data` | Data query | `scripts/get_data.py --query ...` |
| Stocks Screener | `mx-stocks-screener` | Screener | `scripts/get_data.py --query ... --select-type ...` |
| Financial Assistant | `mx-financial-assistant` | Q&A agent | `scripts/generate_answer.py --query ... [--deep-think]` |
| Personal KB Search | `mx-personal-kb-search` | RAG search | `scripts/get_data.py --query ...` |
| Comparable Company Analysis | `comparable-company-analysis` | Analysis | `scripts/get_data.py` → `scripts/excel_theme.py` |
| Stock Diagnosis | `stock-diagnosis` | Analysis | `scripts/get_data.py` |
| Fund Diagnosis | `fund-diagnosis` | Analysis | `scripts/get_data.py` |
| Earnings Review | `stock-earnings-review` | Report (multi-step) | `validate_entity.py` → `normalize_report_period.py` → `call_review_api.py` |
| Initiation of Coverage / Deep Dive | `initiation-of-coverage-or-deep-dive` | Report | `scripts/generate_deep_research_report.py` |
| Industry Research Report | `industry-research-report` | Report | `scripts/get_data.py --query "{{topic}}"` |
| Topic Research Report | `topic-research-report` | Report | `scripts/get_data.py` |
| Stock Market Hotspot Discovery | `stock-market-hotspot-discovery` | Discovery | `scripts/get_data.py --query ...` |
| Industry Stock Tracker | `industry-stock-tracker` | Tracking | `scripts/generate_industry_stock_tracker_report.py` |

## Entity Recognition & Market Support

The entity recognition API (`ENTITY_API = https://ai-saas.eastmoney.com/proxy/entity/dialogTagsV2`) identifies companies/stocks from natural language. Supported market class codes (in `common.py`):
- `002001` — A-shares (沪深京)
- `002003` — Hong Kong stocks
- `002004` — US stocks

Skills that emit reports (earnings review, coverage, etc.) only support these markets. The comparable-company-analysis skill only supports A-shares.

## Multi-Entity Handling

- **mx-finance-data**: ≤5 entities → direct query; >5 entities → batch mode (max 500 per call). Batch mode requires `--indicators`.
- **comparable-company-analysis**: Only supports single entity (takes the first if multiple provided).
- **stock-earnings-review**: Takes the first recognized entity if multiple found.

## Dependencies

Python 3 with: `httpx`, `pandas`, `openpyxl`. Install with:
```bash
pip3 install httpx pandas openpyxl --user
```

## Meta Registry

`mx-skills/meta.json` tracks all published skills with their versions, slugs, and owner IDs. Update this when publishing new skill versions.
