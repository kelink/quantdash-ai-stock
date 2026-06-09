/** mx-skills 数据查询服务 — 前端调用 mx 数据源获取结构化数据 */

import type { Stock } from '../types';
import { resolveScreenerApiBase } from './apiConfig';

const API_BASE = resolveScreenerApiBase();

const ensureOk = async (response: Response) => {
  if (response.ok) return response;
  const detail = await response.text();
  throw new Error(detail || `mx query failed (${response.status})`);
};

export interface MxQueryResult {
  skillType: string;
  query: string;
  rows: any[];
  rowCount: number;
  source: string;
  outputPath?: string;
}

/** 通用 mx 数据查询 */
export const queryMxData = async (
  skillType: string,
  query: string,
  indicators?: string,
): Promise<MxQueryResult> => {
  const response = await ensureOk(
    await fetch(`${API_BASE}/mx-datasource/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillType, query, indicators: indicators || '' }),
    }),
  );
  return response.json();
};

/** 从 mx-finance-data 查询股票列表并转换为 Stock[] 格式 */
export const queryMxStockList = async (): Promise<Stock[]> => {
  const result = await queryMxData('finance', 'A股涨幅榜前50', '最新价,涨跌幅,市盈率,总市值,行业');
  const stocks: Stock[] = [];

  for (const sheet of result.rows) {
    if (!sheet?.rows) continue;
    for (const row of sheet.rows) {
      // mx 数据行的 key 格式: "股票名(代码.MARKET)" 或中文列名
      const keys = Object.keys(row);
      if (keys.length < 2) continue;

      // 尝试从 keys 中提取股票信息
      const dateKey = keys.find((k) => k.match(/^\d{4}-\d{2}-\d{2}/));
      const entityKey = keys.find((k) => k.includes('(') && k.includes(')'));

      if (!entityKey) continue;
      const match = entityKey.match(/^(.+)\((\d+)\.(SH|SZ|BJ)\)$/);
      if (!match) continue;

      const name = match[1];
      const code = match[2];
      const market = match[3];

      // 从 row 值中提取字段
      const values = dateKey ? (row[dateKey] ?? '') : '';
      const allValues: Record<string, string> = {};
      for (const k of keys) {
        if (k !== entityKey) allValues[k] = String(row[k] ?? '');
      }

      // 构建 Stock 对象
      const stock: Stock = {
        symbol: `${market === 'SH' ? '6' : market === 'SZ' ? '0' : '8'}${code}`.slice(0, 6),
        name,
        price: parseFloat(String(row['最新价'] ?? row['现价'] ?? 0)) || 0,
        pctChange: parseFloat(String(row['涨跌幅'] ?? '0').replace('%', '')) || 0,
        volume: String(row['成交量'] ?? '-'),
        turnover: String(row['成交额'] ?? '-'),
        industry: String(row['行业'] ?? ''),
        concepts: [String(row['行业'] ?? '')],
        pe: parseFloat(String(row['市盈率'] ?? 0)) || undefined,
        marketCap: parseFloat(String(row['总市值'] ?? '0').replace(/[万亿]/g, '')) || undefined,
      };

      if (stock.name && stock.price > 0) {
        stocks.push(stock);
      }
    }
  }

  return stocks.slice(0, 50);
};

/** 从 mx-stocks-screener 查询选股结果并转换为 Stock[] */
export const queryMxScreener = async (query: string): Promise<Stock[]> => {
  const result = await queryMxData('screener', query);
  if (!result.rows || !Array.isArray(result.rows)) return [];

  return result.rows.map((row: any) => ({
    symbol: String(row['代码'] || row['symbol'] || '').padStart(6, '0'),
    name: String(row['名称'] || row['name'] || ''),
    price: parseFloat(String(row['最新价(元)'] || row['最新价'] || 0).replace(/[^\d.]/g, '')) || 0,
    pctChange: parseFloat(String(row['涨跌幅(%)'] || row['涨跌幅'] || '0').replace('%', '')) || 0,
    volume: String(row['成交量(股)'] || row['成交量'] || '-'),
    turnover: String(row['成交额(元)'] || row['成交额'] || '-'),
    industry: String(row['行业'] || ''),
    concepts: [String(row['行业'] || '')],
    pe: parseFloat(String(row['市盈率(TTM)(倍)'] || row['市盈率'] || 0).replace(/[^\d.]/g, '')) || undefined,
    marketCap: parseFloat(String(row['总市值(元)'] || row['总市值'] || '0').replace(/[万亿]/g, '')) || undefined,
  })).filter((s: Stock) => s.name && s.price > 0);
};
