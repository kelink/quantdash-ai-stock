/** Hook: 读取 mx 全局主数据源模式，监听变更事件 */

import { useState, useEffect, useCallback } from 'react';
import type { DataSourceGlobalMode } from '../types';
import { loadMxPolicy } from './mxDataSourceService';

const MX_MODE_CHANGE_EVENT = 'mx-global-mode-changed';

/** 触发全局模式变更通知（由 DataSourcePolicyCard 在保存后调用） */
export const notifyMxModeChanged = () => {
  window.dispatchEvent(new CustomEvent(MX_MODE_CHANGE_EVENT));
};

export const useMxGlobalMode = (): {
  globalMode: DataSourceGlobalMode;
  isMxPrimary: boolean;
  loading: boolean;
  refresh: () => void;
} => {
  const [globalMode, setGlobalMode] = useState<DataSourceGlobalMode>('prefer_eastmoney');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    loadMxPolicy()
      .then((p) => setGlobalMode(p.globalMode))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();

    const handler = () => refresh();
    window.addEventListener(MX_MODE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(MX_MODE_CHANGE_EVENT, handler);
  }, [refresh]);

  return {
    globalMode,
    isMxPrimary: globalMode === 'prefer_mx',
    loading,
    refresh,
  };
};
