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
