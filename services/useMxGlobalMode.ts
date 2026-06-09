/** Hook: 读取 mx 全局主数据源模式 */

import { useState, useEffect } from 'react';
import type { DataSourceGlobalMode } from '../types';
import { loadMxPolicy } from './mxDataSourceService';

export const useMxGlobalMode = (): {
  globalMode: DataSourceGlobalMode;
  isMxPrimary: boolean;
  loading: boolean;
} => {
  const [globalMode, setGlobalMode] = useState<DataSourceGlobalMode>('prefer_eastmoney');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadMxPolicy()
      .then((p) => {
        if (!cancelled) setGlobalMode(p.globalMode);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return {
    globalMode,
    isMxPrimary: globalMode === 'prefer_mx',
    loading,
  };
};
