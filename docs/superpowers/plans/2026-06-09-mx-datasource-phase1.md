# mxDataSource 第三数据源集成 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将东方财富妙想 mx-skills 作为第三数据源集成到 QuantDash，支持三层数据源策略（mx → EastMoney → mootdx），用户可自由切换。

**Architecture:** 新增独立 Python 模块 `scripts/server/modules/mx_datasource/`，通过 subprocess 调用 mx-skills 脚本获取数据。后端新增 `/mx-datasource/*` 路由，前端新增 `mxDataSourceService.ts` 服务层。数据源策略从双源扩展为三源，默认保持 `prefer_eastmoney`（向后兼容），用户可切换到 `prefer_mx`。

**Tech Stack:** Python 3 (subprocess, pandas, openpyxl), FastAPI (Pydantic models), TypeScript (React), Tailwind CSS

**Phase:** 1 of 3 — mx_provider 骨架 + 基础健康检查 + 前端三源 UI

---

### Task 1: 扩展 TypeScript 类型定义

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: 在 types.ts 中新增 mx 数据源相关类型**

在 `types.ts` 末尾追加以下类型（保持现有类型不变）：

```typescript
// --- mxDataSource 第三数据源 (Phase 1) ---

export type DataSourceProvider = 'mx' | 'eastmoney' | 'mootdx' | 'local' | 'mock';

export type DataSourceGlobalMode = 'prefer_mx' | 'prefer_eastmoney' | 'prefer_secondary';

export interface MxHealthState {
  available: boolean;
  installedSkills: string[];
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastLatencyMs: number | null;
  probeResults: Record<string, MxProbeResult>;
}

export interface MxProbeResult {
  checkedAt: string | null;
  detail: string;
  latencyMs: number | null;
  ok: boolean;
  skillSlug: string;
}

export interface MxDatasetInfo {
  dataset: string;
  label: string;
  skillSlug: string;
  actions: string[];
}

export interface MxDataSourceStatus {
  available: boolean;
  installedSkills: string[];
  supportedDatasets: MxDatasetInfo[];
  health: MxHealthState;
}
```

注意：不修改现有的 `DataSourcePolicyMode` 类型（保留 `'primary_only' | 'auto_fallback' | 'prefer_secondary'`），新增的类型独立定义，`DataSourceGlobalMode` 是三源策略的新枚举。

- [ ] **Step 2: 验证类型**

```bash
npm run typecheck
```

期望：无新增类型错误（仅可能存在已有的 tushareService.ts 排除项相关提示）。

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat: add mxDataSource TypeScript type definitions"
```

---

### Task 2: 创建 mx_datasource 后端模块 — 政策与健康检查

**Files:**
- Create: `scripts/server/modules/mx_datasource/__init__.py`
- Create: `scripts/server/modules/mx_datasource/mx_policy.py`

- [ ] **Step 1: 创建 mx_policy.py**

```python
# scripts/server/modules/mx_datasource/mx_policy.py
"""mx-skills 数据源健康检查与可用性探测。"""

from __future__ import annotations

import importlib.util
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from server.shared.runtime import ROOT_DIR

MX_SKILLS_DIR = ROOT_DIR / "mxDataSource" / "mx-skills"
MX_DATASETS_METADATA: dict[str, dict[str, Any]] = {
    "stock_quote": {
        "actions": ["stock_quote"],
        "label": "全市场实时行情",
        "skillSlug": "mx-finance-data",
    },
    "financials": {
        "actions": ["financials"],
        "label": "财务报表与估值",
        "skillSlug": "mx-finance-data",
    },
    "macro_indicators": {
        "actions": ["macro_indicators"],
        "label": "宏观指标",
        "skillSlug": "mx-macro-data",
    },
    "stock_screener": {
        "actions": ["stock_screener"],
        "label": "条件选股",
        "skillSlug": "mx-stocks-screener",
    },
    "news_search": {
        "actions": ["news_search"],
        "label": "资讯搜索",
        "skillSlug": "mx-finance-search",
    },
}


def _check_python3() -> bool:
    """检查 python3 是否可用。"""
    try:
        result = subprocess.run(
            ["python3", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            env={**os.environ},
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return False


def _check_mx_skills_dir() -> bool:
    """检查 mx-skills 目录是否存在且包含至少一个 skill。"""
    if not MX_SKILLS_DIR.exists() or not MX_SKILLS_DIR.is_dir():
        return False
    for item in MX_SKILLS_DIR.iterdir():
        if item.is_dir() and (item / "SKILL.md").exists():
            return True
    return False


def _get_installed_skills() -> list[str]:
    """列出 mx-skills 目录下已安装的 skill slug。"""
    if not MX_SKILLS_DIR.exists():
        return []
    skills: list[str] = []
    for item in sorted(MX_SKILLS_DIR.iterdir()):
        if item.is_dir() and (item / "SKILL.md").exists():
            skills.append(item.name)
    return skills


def _check_em_api_key() -> bool:
    """检查 EM_API_KEY 环境变量是否已配置。"""
    return bool(os.environ.get("EM_API_KEY", "").strip())


def is_mx_available() -> bool:
    """mx-skills 数据源是否可用于查询。"""
    return _check_python3() and _check_mx_skills_dir() and _check_em_api_key()


def get_mx_health() -> dict[str, Any]:
    """返回 mx 数据源基础健康状态（不含探测）。"""
    now = datetime.now(timezone.utc).isoformat()
    available = is_mx_available()
    return {
        "available": available,
        "installedSkills": _get_installed_skills(),
        "lastCheckedAt": now,
        "lastSuccessAt": None,
        "lastError": None if available else _build_unavailable_reason(),
        "lastLatencyMs": None,
        "probeResults": {},
    }


def _build_unavailable_reason() -> str:
    parts: list[str] = []
    if not _check_python3():
        parts.append("python3 不可用")
    if not _check_mx_skills_dir():
        parts.append("mx-skills 目录未找到")
    if not _check_em_api_key():
        parts.append("EM_API_KEY 环境变量未配置")
    return "; ".join(parts) if parts else "未知原因"


def probe_mx_skills() -> dict[str, Any]:
    """执行轻量探测，对每个已安装的 skill 做 smoke test。"""
    health = get_mx_health()
    installed = _get_installed_skills()
    probe_results: dict[str, dict[str, Any]] = {}
    success_count = 0

    for slug in installed:
        skill_dir = MX_SKILLS_DIR / slug
        script_path = skill_dir / "scripts" / "get_data.py"
        if not script_path.exists():
            probe_results[slug] = {
                "checkedAt": datetime.now(timezone.utc).isoformat(),
                "detail": "脚本文件不存在",
                "latencyMs": None,
                "ok": False,
                "skillSlug": slug,
            }
            continue

        started = datetime.now(timezone.utc)
        try:
            result = subprocess.run(
                ["python3", str(script_path), "--help"],
                capture_output=True,
                text=True,
                timeout=15,
                cwd=str(ROOT_DIR),
                env={**os.environ},
            )
            elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            ok = result.returncode == 0 and (result.stdout or result.stderr)
            probe_results[slug] = {
                "checkedAt": datetime.now(timezone.utc).isoformat(),
                "detail": "脚本可达" if ok else f"脚本返回码: {result.returncode}",
                "latencyMs": elapsed_ms,
                "ok": ok,
                "skillSlug": slug,
            }
            if ok:
                success_count += 1
        except (subprocess.TimeoutExpired, OSError) as exc:
            elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            probe_results[slug] = {
                "checkedAt": datetime.now(timezone.utc).isoformat(),
                "detail": str(exc),
                "latencyMs": elapsed_ms,
                "ok": False,
                "skillSlug": slug,
            }

    health["probeResults"] = probe_results
    if success_count > 0:
        health["lastSuccessAt"] = datetime.now(timezone.utc).isoformat()
    return health


def get_mx_dataset_catalog() -> list[dict[str, Any]]:
    """返回 mx 数据源支持的数据集目录。"""
    installed = set(_get_installed_skills())
    return [
        {
            "actions": list(config["actions"]),
            "dataset": dataset,
            "label": config["label"],
            "skillSlug": config["skillSlug"],
        }
        for dataset, config in MX_DATASETS_METADATA.items()
        if config["skillSlug"] in installed
    ]


__all__ = [
    "MX_DATASETS_METADATA",
    "MX_SKILLS_DIR",
    "get_mx_dataset_catalog",
    "get_mx_health",
    "is_mx_available",
    "probe_mx_skills",
]
```

- [ ] **Step 2: 创建 `__init__.py`（路由器）**

```python
# scripts/server/modules/mx_datasource/__init__.py
"""mx-skills（东方财富妙想）第三数据源模块。"""

from __future__ import annotations

from fastapi import APIRouter

from server.modules.mx_datasource.mx_policy import (
    get_mx_dataset_catalog,
    get_mx_health,
    probe_mx_skills,
)

ROUTER = APIRouter(tags=["mx-datasource"], prefix="/mx-datasource")


@ROUTER.get("/health")
async def mx_health():
    """返回 mx 数据源健康状态。"""
    return get_mx_health()


@ROUTER.get("/datasets")
async def mx_datasets():
    """返回 mx 数据源支持的数据集清单。"""
    return {"datasets": get_mx_dataset_catalog()}


@ROUTER.post("/probe")
async def mx_probe():
    """执行 mx 数据源主动探测。"""
    return await _run_probe()


async def _run_probe():
    from server.shared.runtime import run_blocking

    return await run_blocking(probe_mx_skills)


__all__ = [
    "ROUTER",
    "mx_datasets",
    "mx_health",
    "mx_probe",
]
```

注意：`_run_probe` 通过 `run_blocking` 在 IO 线程池中运行 subprocess，避免阻塞 FastAPI 事件循环。这与现有 `eastmoney_secondary.py` 的 `probe_secondary_provider` 模式一致。

- [ ] **Step 3: 验证 Python 模块语法**

```bash
python3 -m compileall scripts/server/modules/mx_datasource/
```

期望：Compile 成功，无语法错误。

- [ ] **Step 4: Commit**

```bash
git add scripts/server/modules/mx_datasource/
git commit -m "feat: add mx_datasource backend module — policy and health check"
```

---

### Task 3: 在 FastAPI app 中注册 mx 路由

**Files:**
- Modify: `scripts/server/app.py`

- [ ] **Step 1: 在 app.py 中注册 mx_datasource router**

在 `app.py` 的 import 区域（第 20 行附近）追加：

```python
from server.modules.mx_datasource import ROUTER as MX_DATASOURCE_ROUTER
```

在 router 注册区域（第 48 行附近，`APP.include_router(SCREENER_ROUTER)` 之后）追加：

```python
APP.include_router(MX_DATASOURCE_ROUTER)
```

完整修改后的注册区域应为：

```python
APP.include_router(SYNC_ROUTER)
APP.include_router(INTEGRATIONS_ROUTER)
APP.include_router(SKILL_LIBRARY_ROUTER)
APP.include_router(EASTMONEY_ROUTER)
APP.include_router(GITHUB_UPDATES_ROUTER)
APP.include_router(AUTH_ROUTER)
APP.include_router(WATCHLIST_ROUTER)
APP.include_router(SCREENER_STRATEGY_CATALOG_ROUTER)
APP.include_router(SCREENER_ROUTER)
APP.include_router(MX_DATASOURCE_ROUTER)
```

- [ ] **Step 2: 验证 app 可启动**

```bash
python3 -c "from server.app import APP; print('FastAPI app loaded OK')"
```

期望：`FastAPI app loaded OK`（无 import 错误）。

- [ ] **Step 3: Commit**

```bash
git add scripts/server/app.py
git commit -m "feat: register mx_datasource router in FastAPI app"
```

---

### Task 4: 在现有 status API 中追加 mx 状态字段

**Files:**
- Modify: `scripts/server/modules/eastmoney.py`

- [ ] **Step 1: 在 eastmoney.py 的 status 端点中追加 mx 字段**

在 `eastmoney.py` 文件头部追加 import（第 10 行附近）：

```python
try:
    from server.modules.mx_datasource.mx_policy import get_mx_health as _get_mx_health
except ImportError:
    def _get_mx_health() -> dict:
        return {"available": False, "installedSkills": [], "lastCheckedAt": None,
                "lastSuccessAt": None, "lastError": "mx_datasource 模块未加载", "lastLatencyMs": None, "probeResults": {}}
```

修改 `eastmoney_status` 函数（第 31 行），在返回 dict 中追加 mx 字段：

```python
@ROUTER.get("/eastmoney/status")
async def eastmoney_status(_current_user=Depends(require_user)):
    return {
        "monitor": get_eastmoney_monitor_status(),
        "providerPolicy": get_eastmoney_provider_policy(),
        "refresh": get_eastmoney_refresh_state(),
        "secondaryHealth": get_secondary_provider_health(),
        "mxHealth": _get_mx_health(),
    }
```

- [ ] **Step 2: 验证 Python 模块编译**

```bash
python3 -m compileall scripts/server/modules/eastmoney.py
```

期望：Compile 成功。

- [ ] **Step 3: Commit**

```bash
git add scripts/server/modules/eastmoney.py
git commit -m "feat: append mxHealth field to eastmoney status API endpoint"
```

---

### Task 5: 前端 mxDataSourceService 服务层

**Files:**
- Create: `services/mxDataSourceService.ts`

- [ ] **Step 1: 创建 mxDataSourceService.ts**

```typescript
// services/mxDataSourceService.ts
import type { MxDataSourceStatus, MxHealthState } from '../types';
import { resolveScreenerApiBase } from './apiConfig';

const API_BASE = resolveScreenerApiBase();

const ensureOk = async (response: Response) => {
  if (response.ok) return response;
  const detail = await response.text();
  throw new Error(detail || `mx-datasource request failed (${response.status})`);
};

export const loadMxHealth = async (): Promise<MxHealthState> => {
  const response = await ensureOk(
    await fetch(`${API_BASE}/mx-datasource/health`, { method: 'GET' }),
  );
  return response.json();
};

export const loadMxDatasets = async (): Promise<MxDataSourceStatus['supportedDatasets']> => {
  const response = await ensureOk(
    await fetch(`${API_BASE}/mx-datasource/datasets`, { method: 'GET' }),
  );
  const payload = await response.json();
  return payload.datasets ?? [];
};

export const probeMxHealth = async (): Promise<MxHealthState> => {
  const response = await ensureOk(
    await fetch(`${API_BASE}/mx-datasource/probe`, { method: 'POST' }),
  );
  return response.json();
};
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npm run typecheck
```

期望：无新增类型错误。

- [ ] **Step 3: Commit**

```bash
git add services/mxDataSourceService.ts
git commit -m "feat: add frontend mxDataSourceService for mx-skills data source"
```

---

### Task 6: 扩展 DataSourcePolicyCard 支持三源 UI

**Files:**
- Modify: `components/DataSourcePolicyCard.tsx`

- [ ] **Step 1: 扩展 DataSourcePolicyCard 组件**

要对 `DataSourcePolicyCard.tsx` 做以下修改：

**a) 在 import 区域追加 mx 相关类型和服务：**

在现有的 import 区域后追加：

```typescript
import type { DataSourceGlobalMode, MxHealthState } from '../types';
import { loadMxHealth, probeMxHealth } from '../services/mxDataSourceService';
```

**b) 扩展 MODE_OPTIONS 常量，新增 mx 相关选项：**

在现有 `MODE_OPTIONS` 数组之前追加 `GLOBAL_MODE_OPTIONS`：

```typescript
const GLOBAL_MODE_OPTIONS: Array<{ value: DataSourceGlobalMode; label: string; description: string }> = [
  {
    value: 'prefer_mx',
    label: '妙想 mx（主）',
    description: '优先走妙想 mx-skills 数据源。不可用时自动回落至 EastMoney 和 mootdx。',
  },
  {
    value: 'prefer_eastmoney',
    label: 'EastMoney（主）',
    description: '默认只走 EastMoney，mx 和 mootdx 仅保留状态和手动切换能力。',
  },
  {
    value: 'prefer_secondary',
    label: 'mootdx（主）',
    description: '支持的数据集优先走 mootdx，EastMoney 和 mx 作为兜底。',
  },
];
```

**c) 组件内部新增 mx 状态管理：**

在组件函数体内的现有 `useState` 声明区域（第 57 行附近）追加：

```typescript
const [mxHealth, setMxHealth] = useState<MxHealthState | null>(null);
const [mxProbing, setMxProbing] = useState(false);
const [globalMode_3s, setGlobalMode3S] = useState<DataSourceGlobalMode>('prefer_eastmoney');
```

注意：用新变量 `globalMode_3s` 暂存三源全局模式，Phase 2 会整合到 policy 持久化中。

**d) 在 useEffect 的 load 函数中追加 mx 健康状态加载：**

在 `loadDataSourceStatus()` 调用之后（第 68 行附近）追加：

```typescript
// 同时加载 mx 数据源健康状态
loadMxHealth()
  .then((h) => {
    if (cancelled) return;
    setMxHealth(h);
  })
  .catch(() => {
    // mx 数据源不可用时静默处理，UI 显示灰色
  });
```

**e) 新增 mxProbe handler：**

```typescript
const handleMxProbe = async () => {
  try {
    setMxProbing(true);
    setError(null);
    const nextHealth = await probeMxHealth();
    setMxHealth(nextHealth);
  } catch (probeError) {
    setError(probeError instanceof Error ? probeError.message : 'mx 数据源探测失败');
  } finally {
    setMxProbing(false);
  }
};
```

**f) 在现有"第二数据源策略"section 之前插入 mx 数据源 section（第 137 行 return 中，`mb-4 rounded-xl border` div 之后，插入一个新的 div）：**

```tsx
{/* mxDataSource 妙想数据源状态 */}
<div
  className={`mb-4 rounded-xl border p-4 transition-colors ${
    isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white/80'
  }`}
>
  <div className="flex items-start justify-between gap-3">
    <div>
      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500 dark:text-gray-500">
        Data Source
      </p>
      <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-gray-100">
        <Database size={15} className="text-purple-500" />
        <span>妙想 mx 数据源</span>
      </div>
    </div>
    {mxProbing && <Loader2 size={15} className="shrink-0 animate-spin text-purple-500" />}
  </div>

  <div className="mt-4 space-y-2 text-xs">
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500 dark:text-gray-500">状态</span>
      <span
        className={`font-medium ${
          mxHealth?.available
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-amber-600 dark:text-amber-400'
        }`}
      >
        {mxHealth?.available ? '可用' : '未就绪'}
      </span>
    </div>
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500 dark:text-gray-500">已安装 Skills</span>
      <span className="font-medium text-slate-700 dark:text-gray-200">
        {mxHealth?.installedSkills.length ?? 0}
      </span>
    </div>
  </div>

  {!mxHealth?.available && (
    <p className="mt-2 text-xs leading-5 text-amber-600 dark:text-amber-400">
      当前环境未检测到 mx-skills。请确认 mxDataSource/mx-skills/ 目录存在，且 EM_API_KEY 已配置。
    </p>
  )}

  {/* 全局三源策略切换 */}
  <div className={`mt-4 rounded-lg px-3 py-3 ${isDark ? 'bg-black/20' : 'bg-slate-50'}`}>
    <label
      htmlFor="data-source-global-mode-3s"
      className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-gray-500"
    >
      全局主数据源
    </label>
    <select
      id="data-source-global-mode-3s"
      value={globalMode_3s}
      onChange={(event) => setGlobalMode3S(event.target.value as DataSourceGlobalMode)}
      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
        isDark
          ? 'border-white/10 bg-slate-900/80 text-gray-100 focus:border-purple-500/60'
          : 'border-slate-200 bg-white text-slate-800 focus:border-purple-400'
      }`}
    >
      {GLOBAL_MODE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-gray-300">
      {GLOBAL_MODE_OPTIONS.find((o) => o.value === globalMode_3s)?.description}
    </p>
  </div>

  {/* mx 探测按钮 + 探测结果 */}
  <div className={`mt-4 rounded-lg border px-3 py-3 ${isDark ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-slate-50'}`}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-gray-500">
        <Stethoscope size={13} />
        <span>mx Skills 探测</span>
      </div>
      <button
        type="button"
        onClick={handleMxProbe}
        disabled={mxProbing}
        className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
          mxProbing
            ? 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-white/10 dark:text-gray-500'
            : isDark
              ? 'bg-purple-500/10 text-purple-300 hover:bg-purple-500/15'
              : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
        }`}
      >
        {mxProbing ? '探测中...' : '运行探测'}
      </button>
    </div>

    <div className="mt-3 space-y-2 text-xs text-slate-700 dark:text-gray-200">
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-500 dark:text-gray-500">最近探测</span>
        <span>{mxHealth?.lastCheckedAt ?? '未记录'}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-500 dark:text-gray-500">最近错误</span>
        <span>{mxHealth?.lastError ?? '无'}</span>
      </div>
    </div>

    {mxHealth?.probeResults && Object.keys(mxHealth.probeResults).length > 0 && (
      <div className="mt-3 space-y-2">
        {Object.entries(mxHealth.probeResults).map(([slug, result]) => (
          <div
            key={slug}
            className={`flex items-center justify-between gap-3 rounded-md px-2 py-2 text-[11px] ${
              isDark ? 'bg-white/5 text-gray-300' : 'bg-white text-slate-600'
            }`}
          >
            <div>
              <div className="font-semibold text-slate-700 dark:text-gray-100">{slug}</div>
              <div className="mt-1 text-slate-500 dark:text-gray-400">{result.detail}</div>
            </div>
            <div className="text-right">
              <div className={result.ok ? 'text-emerald-500' : 'text-amber-500'}>
                {result.ok ? '通过' : '失败'}
              </div>
              <div className="mt-1 text-slate-500 dark:text-gray-400">
                {result.latencyMs ? `${result.latencyMs} ms` : '未测速'}
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
</div>
```

注意：现有"第二数据源策略"section（`第 137-365 行`）完全保持不变。新代码只在它之前插入一个新的 mx section。

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npm run typecheck
```

期望：无新增类型错误。

- [ ] **Step 3: 验证 ESLint**

```bash
npm run lint
```

期望：无新增 lint 错误。

- [ ] **Step 4: Commit**

```bash
git add components/DataSourcePolicyCard.tsx
git commit -m "feat: add mxDataSource section to DataSourcePolicyCard with health probe UI"
```

---

### Task 7: 端到端验证

**Files:**
- 无新增文件

- [ ] **Step 1: 启动后端验证 mx 端点可访问**

```bash
# 在一个终端启动 Python 后端
cd scripts/server && python3 -m uvicorn app:APP --host 0.0.0.0 --port 7878 &
sleep 2
curl -s http://127.0.0.1:7878/mx-datasource/health | python3 -m json.tool
```

期望：返回 JSON，包含 `available`、`installedSkills` 等字段。在没有 EM_API_KEY 的环境下 `available` 应为 `false`。

- [ ] **Step 2: 验证 frontend build**

```bash
npm run build
```

期望：Build 成功。

- [ ] **Step 3: 关闭后端**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 4: 最终验收检查**

- [x] `npm run typecheck` → 通过
- [x] `npm run lint` → 通过
- [x] `npm run build` → 成功
- [x] 现有功能不受影响（sidebar 原有双源切换仍正常工作）
- [x] mx 不可用时 sidebar 显示灰色"未就绪"
- [x] mx 可用时可通过探测按钮测试各 skill 连通性

- [ ] **Step 5: Commit 最终验证结果**

```bash
git add -A
git commit -m "chore: Phase 1 mxDataSource integration verification passed"
```

---

## Phase 2 预览

Phase 2 将在 Phase 1 基础之上实现：
- `mx_provider.py` — subprocess 包装器调用 `get_data.py` 查询实际数据
- `mx_cache.py` — SQLite 缓存层
- 前端 `mxDataSourceService.ts` 新增数据查询接口
- 三源 fallback 链路完整实现（mx → eastmoney → mootdx → snapshot）
- 前端面板接入 mx 数据（stock_quote、stock_screener 数据集）

Phase 2 将在 Phase 1 验证通过、确认 mx-skills 环境就绪后执行。

## Phase 3 预览

Phase 3 将在 Phase 2 基础之上实现：
- `mx_ai.py` — LLM 代理调用 mx-skills 的 AI 分析能力
- AI 复盘/盘前计划集成 mx-skills 分析结果（个股诊断、财报审查、热点发现）
- 前端 AI 对接页面显示 mx-skill 分析结果
