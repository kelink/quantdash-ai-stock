import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Database, Loader2, Save, Stethoscope } from 'lucide-react';
import type {
  DataSourceGlobalMode,
  DataSourcePolicyMode,
  DataSourcePolicyState,
  MxHealthState,
  MxProbeResult,
  SecondaryHealthProbeResult,
  SecondaryHealthState,
} from '../types';
import {
  loadDataSourceStatus,
  probeDataSourceHealth,
  updateDataSourcePolicy,
} from '../services/dataSourcePolicyService';
import { loadMxHealth, loadMxPolicy, probeMxHealth, saveMxPolicy } from '../services/mxDataSourceService';
import { notifyMxModeChanged } from '../services/useMxGlobalMode';

interface DataSourcePolicyCardProps {
  isDark: boolean;
}

const GLOBAL_MODE_OPTIONS: Array<{ value: DataSourceGlobalMode; label: string }> = [
  { value: 'prefer_mx', label: '妙想 mx' },
  { value: 'prefer_eastmoney', label: 'EastMoney' },
  { value: 'prefer_secondary', label: 'mootdx' },
];

const MODE_OPTIONS: Array<{ value: DataSourcePolicyMode; label: string }> = [
  { value: 'primary_only', label: '主源优先' },
  { value: 'auto_fallback', label: '自动切第二源' },
  { value: 'prefer_secondary', label: '优先第二源' },
];

const formatTime = (value?: string | null) => {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
};

const DataSourcePolicyCard: React.FC<DataSourcePolicyCardProps> = ({ isDark }) => {
  const [policy, setPolicy] = useState<DataSourcePolicyState | null>(null);
  const [health, setHealth] = useState<SecondaryHealthState | null>(null);
  const [globalMode2nd, setGlobalMode2nd] = useState<DataSourcePolicyMode>('primary_only');
  const [datasetOverrides, setDatasetOverrides] = useState<Record<string, DataSourcePolicyMode>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mxHealth, setMxHealth] = useState<MxHealthState | null>(null);
  const [mxProbing, setMxProbing] = useState(false);
  const [globalMode3S, setGlobalMode3S] = useState<DataSourceGlobalMode>('prefer_eastmoney');

  // 加载 mx 健康状态
  useEffect(() => {
    let cancelled = false;
    loadMxHealth()
      .then((h) => { if (!cancelled) setMxHealth(h); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 加载 mx 全局策略
  useEffect(() => {
    let cancelled = false;
    loadMxPolicy()
      .then((p) => { if (!cancelled) setGlobalMode3S(p.globalMode); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 加载第二数据源策略
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const s = await loadDataSourceStatus();
        if (cancelled) return;
        setPolicy(s.providerPolicy);
        setHealth(s.secondaryHealth);
        setGlobalMode2nd(s.providerPolicy.globalMode);
        setDatasetOverrides(s.providerPolicy.datasetOverrides);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '读取失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleGlobalModeChange = (mode: DataSourceGlobalMode) => {
    setGlobalMode3S(mode);
    saveMxPolicy(mode)
      .then(() => notifyMxModeChanged())
      .catch(() => {});
  };

  const handleSave = async () => {
    try { setSaving(true); setError(null); const p = await updateDataSourcePolicy(globalMode2nd, datasetOverrides); setPolicy(p); setGlobalMode2nd(p.globalMode); setDatasetOverrides(p.datasetOverrides); } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); } finally { setSaving(false); }
  };

  const handleProbe = async () => {
    try { setProbing(true); setError(null); setHealth(await probeDataSourceHealth()); } catch (e) { setError(e instanceof Error ? e.message : '探测失败'); } finally { setProbing(false); }
  };

  const handleMxProbe = async () => {
    try { setMxProbing(true); setError(null); setMxHealth(await probeMxHealth()); } catch (e) { setError(e instanceof Error ? e.message : 'mx 探测失败'); } finally { setMxProbing(false); }
  };

  const isDirty = useMemo(() => {
    if (!policy) return false;
    return policy.globalMode !== globalMode2nd || JSON.stringify(policy.datasetOverrides) !== JSON.stringify(datasetOverrides);
  }, [datasetOverrides, globalMode2nd, policy]);

  const isBusy = loading || saving || probing;
  const mxOk = mxHealth?.available ?? false;
  const mdxOk = policy?.secondaryAvailable ?? false;

  return (
    <div className={`mb-4 rounded-xl border p-3 transition-colors ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white/80'}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-cyan-500" />
          <span className="text-xs font-semibold text-slate-800 dark:text-gray-100">数据源</span>
        </div>
        {isBusy && <Loader2 size={12} className="shrink-0 animate-spin text-cyan-500" />}
      </div>

      {/* Primary source selector + inline status */}
      <div className="mt-2 flex items-center gap-2">
        <select
          value={globalMode3S}
          onChange={(e) => handleGlobalModeChange(e.target.value as DataSourceGlobalMode)}
          className={`flex-1 rounded-md border px-2 py-1.5 text-xs outline-none transition-colors ${isDark ? 'border-white/10 bg-slate-900/80 text-gray-100 focus:border-cyan-500/60' : 'border-slate-200 bg-white text-slate-800 focus:border-cyan-400'}`}
        >
          {GLOBAL_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* inline status dots */}
        <span className={`text-[10px] font-medium ${mxOk ? 'text-emerald-500' : 'text-slate-400'}`} title={mxOk ? '妙想 mx 可用' : '妙想 mx 未就绪'}>
          mx{mxOk ? '✓' : '✗'}
        </span>
        <span className={`text-[10px] font-medium ${mdxOk ? 'text-emerald-500' : 'text-slate-400'}`} title={mdxOk ? 'mootdx 可用' : 'mootdx 未就绪'}>
          mdx{mdxOk ? '✓' : '✗'}
        </span>
      </div>

      {/* One-line status */}
      {mxHealth?.lastCheckedAt && (
        <div className="mt-1.5 text-[10px] text-slate-500 dark:text-gray-500">
          mx: {mxHealth.installedSkills.length} skills · 探测: {formatTime(mxHealth.lastCheckedAt)}
        </div>
      )}

      {/* Error */}
      {error && <p className="mt-1 text-[10px] text-rose-500">{error}</p>}

      {/* Expand/collapse advanced */}
      <button
        type="button"
        onClick={() => setShowAdvanced((p) => !p)}
        className={`mt-2 flex w-full items-center justify-between rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${isDark ? 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/[0.07]' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
      >
        <span>高级设置</span>
        {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Advanced panel */}
      {showAdvanced && (
        <div className="mt-2 space-y-2">
          {/* mx probe */}
          <div className={`rounded-md border px-2 py-2 ${isDark ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-500 dark:text-gray-400">mx Skills 探测</span>
              <button onClick={handleMxProbe} disabled={mxProbing}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${mxProbing ? 'text-slate-400' : isDark ? 'bg-purple-500/10 text-purple-300' : 'bg-purple-50 text-purple-700'}`}>
                {mxProbing ? '探测中' : '运行'}
              </button>
            </div>
            {mxHealth?.probeResults && Object.keys(mxHealth.probeResults).length > 0 && (
              <div className="mt-1.5 max-h-24 overflow-y-auto space-y-0.5">
                {Object.entries(mxHealth.probeResults).map(([slug, r]: [string, MxProbeResult]) => (
                  <div key={slug} className="flex items-center justify-between text-[9px]">
                    <span className="text-slate-500 dark:text-gray-400 truncate mr-2">{slug}</span>
                    <span className={r.ok ? 'text-emerald-500' : 'text-amber-500'}>{r.ok ? '✓' : '✗'} {r.latencyMs ? `${r.latencyMs}ms` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Secondary source mode */}
          <div className={`rounded-md border px-2 py-2 ${isDark ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-slate-50'}`}>
            <span className="text-[10px] text-slate-500 dark:text-gray-400">mootdx 第二源策略</span>
            <select value={globalMode2nd} onChange={(e) => setGlobalMode2nd(e.target.value as DataSourcePolicyMode)}
              className={`mt-1 w-full rounded border px-1.5 py-1 text-[10px] outline-none ${isDark ? 'border-white/10 bg-slate-900/80 text-gray-100' : 'border-slate-200 bg-white text-slate-800'}`}>
              {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Per-dataset overrides */}
          {policy?.supportedDatasets && policy.supportedDatasets.length > 0 && (
            <div className={`rounded-md border px-2 py-2 ${isDark ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-slate-50'}`}>
              <span className="text-[10px] text-slate-500 dark:text-gray-400">按数据集覆盖</span>
              <div className="mt-1 max-h-32 overflow-y-auto space-y-1">
                {policy.supportedDatasets.map((ds) => (
                  <div key={ds.dataset} className="flex items-center justify-between gap-1">
                    <span className="text-[9px] text-slate-500 dark:text-gray-400 truncate">{ds.label}</span>
                    <select value={datasetOverrides[ds.dataset] ?? globalMode2nd}
                      onChange={(e) => setDatasetOverrides((prev) => ({ ...prev, [ds.dataset]: e.target.value as DataSourcePolicyMode }))}
                      className={`rounded border px-1 py-0.5 text-[9px] outline-none ${isDark ? 'border-white/10 bg-slate-900/80 text-gray-200' : 'border-slate-200 bg-white text-slate-700'}`}>
                      {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Secondary health */}
          <div className={`rounded-md border px-2 py-2 ${isDark ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-500 dark:text-gray-400">mootdx 健康</span>
              <button onClick={handleProbe} disabled={probing}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${probing ? 'text-slate-400' : isDark ? 'bg-cyan-500/10 text-cyan-300' : 'bg-cyan-50 text-cyan-700'}`}>
                {probing ? '探测中' : '探测'}
              </button>
            </div>
            <div className="mt-1 text-[9px] text-slate-500 dark:text-gray-400 space-y-0.5">
              <div>成功: {formatTime(health?.lastSuccessAt)}</div>
              <div>耗时: {health?.lastLatencyMs ? `${health.lastLatencyMs}ms` : '-'}</div>
              <div>错误: {health?.lastError ?? '-'}</div>
            </div>
            {health?.probeResults && Object.keys(health.probeResults).length > 0 && (
              <div className="mt-1 max-h-20 overflow-y-auto space-y-0.5">
                {Object.entries(health.probeResults as Record<string, SecondaryHealthProbeResult>).map(([ds, r]) => (
                  <div key={ds} className="flex items-center justify-between text-[9px]">
                    <span className="text-slate-500 dark:text-gray-400 truncate mr-2">{ds}</span>
                    <span className={r.ok ? 'text-emerald-500' : 'text-amber-500'}>{r.ok ? '✓' : '✗'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save button */}
          <button onClick={handleSave} disabled={isBusy || !isDirty}
            className={`flex w-full items-center justify-center gap-1 rounded-md border py-1.5 text-[10px] font-semibold transition-colors ${isBusy || !isDirty ? 'cursor-not-allowed border-slate-300/50 text-slate-400 dark:border-white/10 dark:text-gray-500' : isDark ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-cyan-200 bg-cyan-50 text-cyan-700'}`}>
            <Save size={11} />
            <span>{saving ? '保存中' : isDirty ? '保存第二源策略' : '已同步'}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default DataSourcePolicyCard;
