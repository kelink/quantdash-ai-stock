import type { DataSourceGlobalMode, MxDataSourceStatus, MxHealthState } from '../types';
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

export interface MxPolicyResponse {
  globalMode: DataSourceGlobalMode;
  updatedAt: string | null;
}

export const loadMxPolicy = async (): Promise<MxPolicyResponse> => {
  const response = await ensureOk(
    await fetch(`${API_BASE}/mx-datasource/policy`, { method: 'GET' }),
  );
  return response.json();
};

export const saveMxPolicy = async (globalMode: DataSourceGlobalMode): Promise<MxPolicyResponse> => {
  const response = await ensureOk(
    await fetch(`${API_BASE}/mx-datasource/policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ globalMode }),
    }),
  );
  return response.json();
};
