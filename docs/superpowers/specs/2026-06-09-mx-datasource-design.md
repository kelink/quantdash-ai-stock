# mxDataSource 第三数据源集成设计

**日期:** 2026-06-09
**状态:** 设计中 → 待评审

---

## 1. 目标

将东方财富妙想（mx-skills）作为 QuantDash 的第三数据源，支持三层数据源策略：**mx（主）→ EastMoney（备）→ mootdx（第三备）→ local/snapshot（兜底）**。

- Layer 1：程序化调用 mx-skills 的数据查询脚本，解析结构化输出（xlsx/csv/md），用于高频批量数据
- Layer 2：LLM 代理调用 mx-skills 的 AI 分析能力（研报、诊断、热点发现），用于 AI 复盘/盘前计划等场景

## 2. 约束

- **不可破坏现有功能**：所有现有 EastMoney、mootdx、本地数据链路必须保持完好
- 现有数据源策略默认为 `primary_only`（EastMoney），不主动切换
- 新增代码通过新增文件和模块扩展实现，不在现有关键文件中内联大段新逻辑
- mx-skills 底层 API 协议不对外公开文档，Phase 1 通过 subprocess 包装脚本调用

## 3. 架构

```
┌──────────────────────────────────────────────────────┐
│                  QuantDash Frontend                   │
│  dataSourcePolicyService.ts (三源切换)                 │
│  mxDataSourceService.ts (new)                        │
└─────────────────────┬────────────────────────────────┘
                      │ HTTP
┌─────────────────────▼────────────────────────────────┐
│              Python Backend (FastAPI)                  │
│  /mx-datasource/*              (new module)           │
│  /eastmoney/*                  (existing, unchanged)  │
│  /eastmoney/provider-policy    (extended to 3-source) │
└──────┬──────────────────────┬────────────────────────┘
       │                      │
┌──────▼──────────┐  ┌───────▼─────────────────┐
│ MxDataProvider  │  │ EastMoney Actions       │
│ (Layer 1)       │  │ + Secondary Provider    │
│                 │  │ (existing, unchanged)   │
│ subprocess →    │  │                         │
│ get_data.py →   │  │                         │
│ parse .xlsx/.csv│  │                         │
└──────┬──────────┘  └─────────────────────────┘
       │
┌──────▼────────────────────┐
│ mx-skills/ scripts        │
│ 15 skills via             │
│ ai-saas.eastmoney.com     │
└───────────────────────────┘
```

## 4. 数据源策略扩展

### 4.1 策略模式（从 3 档扩为 4 档）

```typescript
// types.ts 扩展
type DataSourceGlobalMode = 'prefer_mx' | 'prefer_eastmoney' | 'prefer_secondary' | 'auto_fallback';
// prefer_mx            — 优先 mx-skills，不可用时 fallback
// prefer_eastmoney     — 优先 EastMoney（默认，兼容现有行为）
// prefer_secondary     — 优先 mootdx
// auto_fallback        — mx → eastmoney → mootdx → snapshot 自动链式降级
```

### 4.2 按数据集覆盖

与现有 `datasetOverrides` 机制一致，新增 mx 数据集 key：
- `stock_quote` — mx-finance-data
- `financials` — mx-finance-data
- `macro_indicators` — mx-macro-data
- `stock_screener` — mx-stocks-screener
- `news_search` — mx-finance-search

### 4.3 兜底链路

```
mx_query(request)
  ├─ mx 可用？ → 返回 mx 数据
  ├─ mx 失败 ↓
  ├─ eastmoney 可用？ → 返回 eastmoney 数据
  ├─ eastmoney 失败 ↓
  ├─ mootdx 可用 && 数据集支持？ → 返回 mootdx 数据
  └─ 全部失败 → 返回本地快照 / 错误
```

## 5. 新增模块

### 5.1 后端 Python

```
scripts/server/modules/mx_datasource/
  __init__.py           # APIRouter 定义 + 路由注册
  mx_provider.py        # subprocess 包装器 + 输出解析器
  mx_cache.py           # SQLite 缓存层
  mx_ai.py              # Layer 2 LLM 代理（Phase 3）
  mx_policy.py           # mx 数据源健康检查 + 可用性探测
```

**mx_provider.py 核心接口：**

```python
class MxDataProvider:
    def query_finance_data(query: str, indicators: str) -> ParsedMxResult
    def query_stock_screener(query: str, select_type: str) -> ParsedMxResult
    def query_macro_data(query: str, indicators: str) -> ParsedMxResult
    def search_finance(query: str) -> ParsedMxResult

class ParsedMxResult:
    rows: list[dict[str, Any]]
    meta: dict[str, Any]          # skill, query_id, row_count, timestamp
    source: Literal["mx_provider"]
```

**mx_cache.py：**
- 基于 SQLite WAL 模式（复用 shared/db.py 模式）
- 缓存 key：`skill_slug + query_hash`
- TTL 可配置（默认行情 60s，财务数据 1h）

**mx_policy.py：**
- 探测 mx-skills 是否可用（检查 python3 可用性 + EM_API_KEY 环境变量 + 脚本路径 + 轻量 smoke 查询）
- 返回健康状态（可用 / 部分可用 / 不可用）
- 记录最近探测时间、耗时、错误信息

### 5.2 后端路由

```python
# __init__.py
ROUTER = APIRouter(tags=["mx-datasource"], prefix="/mx-datasource")

@ROUTER.get("/health")
async def mx_health()                    # 健康检查 + 可用性

@ROUTER.get("/datasets")
async def mx_datasets()                  # 支持的 mx 数据集清单

@ROUTER.post("/query")
async def mx_query(payload: MxQueryPayload)  # 通用数据查询

@ROUTER.post("/screener")
async def mx_screener(payload: MxScreenerPayload)  # 选股查询

@ROUTER.post("/probe")
async def mx_probe()                     # 主动探测
```

### 5.3 前端

```typescript
// services/mxDataSourceService.ts
export async function loadMxDataSourceStatus(): Promise<MxDataSourceStatus>
export async function probeMxDataSourceHealth(): Promise<MxHealthState>
export async function queryMxData(params: MxQueryParams): Promise<MxQueryResult>
export async function queryMxScreener(params: MxScreenerParams): Promise<MxQueryResult>
```

### 5.4 类型扩展（types.ts）

新增类型：
```typescript
type DataSourceProvider = 'mx' | 'eastmoney' | 'mootdx' | 'local' | 'mock'
type DataSourceGlobalMode = 'prefer_mx' | 'prefer_eastmoney' | 'prefer_secondary' | 'auto_fallback'

interface MxDataSourceStatus {
  available: boolean
  installedSkills: string[]        // 已安装的 skill slug 列表
  supportedDatasets: MxDatasetInfo[]
  health: MxHealthState
}

interface MxHealthState {
  lastCheckedAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  lastLatencyMs: number | null
  probeResults: Record<string, MxProbeResult>
}

interface MxDatasetInfo {
  dataset: string
  label: string
  skillSlug: string                // 对应的 mx-skill
  actions: string[]                // 支持的 action 列表
}
```

## 6. Layer 1 实现细节（脚本包装器）

### 6.1 subprocess 调用

```python
import subprocess
import tempfile
import os

def run_mx_skill(skill_dir: str, args: list[str], cwd: str) -> subprocess.CompletedProcess:
    cmd = ["python3", str(skill_dir / "scripts" / "get_data.py")] + args
    env = {**os.environ, "EM_API_KEY": os.environ.get("EM_API_KEY", "")}
    return subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=120)
```

### 6.2 输出解析

```python
def parse_mx_output(stdout: str, skill_dir: Path) -> ParsedMxResult:
    # 解析脚本 stdout 中的输出文件路径
    # 例如: "文件: ./miaoxiang/mx_finance_data/mx_finance_data_9535fe18.xlsx"
    # → 读取该文件 → pandas DataFrame → list[dict]
    pass
```

### 6.3 并发控制

- 单实例 subprocess 互斥锁（避免多请求同时调用同一 skill 脚本产生文件冲突）
- 超时 120s（多数查询应在 30s 内完成）
- 失败不重试 Layer 1（直接 fallback 到 eastmoney）

## 7. 三层数据源策略流转

```python
# eastmoney_policy.py 扩展
async def execute_with_policy(action: str, params: dict, timeout_ms: int):
    source_order = resolve_source_order()

    for source in source_order:
        try:
            if source == "mx":
                return await execute_mx_action(action, params)
            elif source == "eastmoney":
                return await execute_eastmoney_action(action, params)
            elif source == "mootdx":
                return await execute_secondary_action(action, params)
        except SourceUnavailableError:
            continue

    raise AllSourcesFailedError(...)
```

## 8. 现有文件修改清单（最小侵入）

| 文件 | 变更说明 | 风险 |
|---|---|---|
| `types.ts` | 新增 mx 相关类型 + 扩展 globalMode | 低，仅新增类型 |
| `services/dataSourcePolicyService.ts` | 新增 mx status/provider-policy API 调用 | 低，新增函数 |
| `components/DataSourcePolicyCard.tsx` | UI 从双源扩展为三源展示 | 中，需保留现有双源 UI 兼容性 |
| `scripts/server/app.py` | 注册 mx_datasource router | 低，一行 import |
| `scripts/server/modules/eastmoney_policy.py` | fallback 链路扩展 mx 层 | 中，需保持现有逻辑不变 |
| `scripts/server/modules/eastmoney.py` | status 接口返回增加 mx 状态字段 | 低，向后兼容 |
| `scripts/server/modules/eastmoney_actions.py` | action 执行入口增加 mx 分支 | 中，需保持现有 action 不变 |

## 9. 不破坏现有功能的保证措施

1. **默认策略不变**：新增 `prefer_mx` 和 `auto_fallback` 后，默认值仍为 `prefer_eastmoney`，除非用户手动切换
2. **mx 不可用 = 不发生行为变化**：如果 mx-skills 未安装或无法访问，系统行为与现在完全一致
3. **所有现有 API 端点向后兼容**：`/eastmoney/status` 返回结构新增 `mx` 字段但不删除现有字段
4. **新增独立文件**：核心逻辑写在 `mx_datasource/` 新目录内，不在现有模块中内联大段新代码
5. **前端 source badge 渐进增强**：新增 `MX · 妙想` 徽标，现有 `EastMoney`/`Mootdx`/`本地` 不变

## 10. Phase 划分

### Phase 1：mx_provider 骨架 + 基础健康检查
- mx_datasource 模块 + subprocess wrapper
- health/probe API
- 前端三源切换 UI（mx 不可用时灰色显示）
- 不改变默认策略

### Phase 2：Layer 1 数据接入
- mx-finance-data → stock_quote 数据集
- mx-stocks-screener → stock_screener 数据集
- mx_cache.py
- 三源 fallback 链路完整实现

### Phase 3：Layer 2 AI 能力
- mx_ai.py
- AI 复盘/盘前计划集成 mx-skills 分析结果
- 个股观察集成 stock-diagnosis

## 11. 测试策略

- `mx_provider.py`：mock subprocess 输出，验证解析逻辑
- `mx_policy.py`：验证健康检查在 skill 可用/不可用时的表现
- `eastmoney_policy.py`：验证三源 fallback 链路，确保现有双源继续工作
- 前端：`DataSourcePolicyCard` 验证三源 UI 默认/切换/灰色状态

## 12. 验收

- `npm run dev` → 页面正常加载，现有功能不受影响
- `npm run typecheck` → 无新增类型错误
- `npm run lint` → 无新增 lint 错误
- `npm run build` → 构建成功
- 未安装 mx-skills 时：sidebar 显示 mx 不可用，现有双源切换正常工作
- 安装 mx-skills + 配置 EM_API_KEY 后：可切换至 mx 为主源，数据正常加载
