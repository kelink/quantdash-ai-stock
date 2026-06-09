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

/** 从 mx-finance-data 查询指定股票列表并转换为 Stock[] 格式 */
export const queryMxStockList = async (): Promise<Stock[]> => {
  // 查询主要指数 + 热门股票
  const query = '上证指数 深证成指 创业板指 贵州茅台 宁德时代 比亚迪 招商银行 中国平安 中芯国际 东方财富 五粮液 隆基绿能 美的集团 恒瑞医药 中信证券';
  const result = await queryMxData('finance', query, '最新价,涨跌幅,市盈率,总市值,成交量,成交额,行业');
  const stocks: Stock[] = [];

  for (const sheet of result.rows) {
    if (!sheet?.rows) continue;
    for (const row of sheet.rows) {
      const keys = Object.keys(row);
      if (keys.length < 2) continue;

      // 找到实体 key（格式: "股票名(代码.MARKET)"）
      const entityKey = keys.find((k) => k.includes('(') && k.includes(')') && !k.match(/^\d{4}-\d{2}/));
      if (!entityKey) continue;
      const match = entityKey.match(/^(.+)\((\d+)\.(SH|SZ|BJ)\)$/);
      if (!match) continue;

      const name = match[1];
      const code = match[2];

      // 找数值列 key
      const valueKeys = keys.filter((k) => k !== entityKey);
      const values: Record<string, string> = {};
      for (const vk of valueKeys) {
        values[vk] = String(row[vk] ?? '');
      }

      // 从 row 中提取字段
      const getVal = (...names: string[]) => {
        for (const n of names) {
          for (const [k, v] of Object.entries(values)) {
            if (k.includes(n)) return String(v);
          }
        }
        return '';
      };

      const priceStr = getVal('最新价', '现价', '收盘价');
      const pctStr = getVal('涨跌幅');
      const peStr = getVal('市盈率');
      const mcapStr = getVal('总市值');
      const volStr = getVal('成交量');
      const amtStr = getVal('成交额');
      const indStr = getVal('行业');

      const stock: Stock = {
        symbol: code.padStart(6, '0'),
        name,
        price: parseFloat(priceStr.replace(/[^\d.]/g, '')) || 0,
        pctChange: parseFloat(pctStr.replace(/[%％]/g, '')) || 0,
        volume: volStr || '-',
        turnover: amtStr || '-',
        industry: indStr || '',
        concepts: [indStr || ''],
        pe: parseFloat(peStr.replace(/[^\d.]/g, '')) || undefined,
        marketCap: parseFloat(mcapStr.replace(/[万亿]/g, '')) || undefined,
      };

      if (stock.name && stock.price > 0) {
        stocks.push(stock);
      }
    }
  }

  return stocks;
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
