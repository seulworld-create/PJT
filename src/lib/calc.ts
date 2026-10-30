import type { Filter, Row, Status } from './types';
import { scopeRowsForMonth } from './filter';

/** 소수 첫째 자리 반올림 (부동소수 오차를 먼저 정리한 뒤 사사오입, 음수도 대칭) */
export function round1(x: number): number {
  const v = Number((x * 10).toPrecision(12));
  const r = Math.sign(v) * Math.round(Math.abs(v));
  return r === 0 ? 0 : r / 10;
}

export function fmtNum(x: number, minFraction = 1): string {
  return round1(x).toLocaleString('en-US', { minimumFractionDigits: minFraction, maximumFractionDigits: 1 });
}
export const fmtPct = (x: number) => `${fmtNum(x)}%`;
export const fmtPp = (x: number) => {
  const r = round1(x);
  return `${r > 0 ? '+' : ''}${fmtNum(x)}pp`;
};
/** 백만원 단위 금액 */
export const fmtMoney = (x: number) => fmtNum(x);
/** 계약금액처럼 정수로 떨어지는 금액 */
export const fmtMoneyInt = (x: number) => fmtNum(x, 0);

export type RowIndex = Map<string, Row>;
export const keyOf = (month: string, siteId: string) => `${month}|${siteId}`;
export function buildIndex(rows: Row[]): RowIndex {
  return new Map(rows.map((r) => [keyOf(r.month, r.siteId), r]));
}

export function prevMonthOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 공정차이(pp): 실제 - 계획 */
export const gapOf = (r: Pick<Row, 'plannedProgress' | 'actualProgress'>) => r.actualProgress - r.plannedProgress;

/** 0pp 이상 정상 / -5pp 초과 0pp 미만 주의 / -5pp 이하 점검 (이진 부동소수 오차는 정리 후 비교) */
export function statusOf(gap: number): Status {
  const g = Math.round(gap * 1e9) / 1e9;
  if (g >= 0) return '정상';
  if (g > -5) return '주의';
  return '점검';
}

export interface SiteMetrics {
  rate: number; // 기성률 %
  gap: number; // 공정차이 pp
  status: Status;
  /** 바로 전월 자료가 없으면 null (0이나 누적값으로 대신하지 않는다) */
  monthly: number | null;
}

export function siteMetrics(row: Row, index: RowIndex): SiteMetrics {
  const prev = index.get(keyOf(prevMonthOf(row.month), row.siteId));
  const gap = gapOf(row);
  return {
    rate: (row.cumulativeEarned / row.contractAmount) * 100,
    gap,
    status: statusOf(gap),
    monthly: prev ? row.cumulativeEarned - prev.cumulativeEarned : null,
  };
}

export interface RankedSite {
  row: Row;
  m: SiteMetrics;
}

/** 점검 우선순위: 공정차이 오름차순, 같으면 현장 ID 오름차순 */
export function rankSites(scope: Row[], index: RowIndex): RankedSite[] {
  const near = (g: number) => Math.round(g * 1e9) / 1e9;
  return scope
    .map((row) => ({ row, m: siteMetrics(row, index) }))
    .sort((a, b) => near(a.m.gap) - near(b.m.gap) || (a.row.siteId < b.row.siteId ? -1 : a.row.siteId > b.row.siteId ? 1 : 0));
}

export interface Summary {
  siteCount: number;
  contract: number;
  earned: number;
  rate: number;
  planned: number;
  actual: number;
  /** 반올림 전 가중 실제 - 반올림 전 가중 계획 */
  gap: number;
  /** 범위 현장 모두에 전월 값이 있을 때만 합산, 아니면 null */
  monthly: number | null;
  counts: Record<Status, number>;
}

/** 한 달·한 범위의 전체 지표. 현장이 없으면 null (0%로 대신하지 않는다) */
export function summarize(scope: Row[], index: RowIndex): Summary | null {
  if (scope.length === 0) return null;
  let contract = 0;
  let earned = 0;
  let pw = 0;
  let aw = 0;
  let monthly: number | null = 0;
  const counts: Record<Status, number> = { 정상: 0, 주의: 0, 점검: 0 };
  for (const r of scope) {
    contract += r.contractAmount;
    earned += r.cumulativeEarned;
    pw += r.contractAmount * r.plannedProgress;
    aw += r.contractAmount * r.actualProgress;
    const m = siteMetrics(r, index);
    counts[m.status]++;
    monthly = monthly === null || m.monthly === null ? null : monthly + m.monthly;
  }
  const planned = pw / contract;
  const actual = aw / contract;
  return {
    siteCount: scope.length,
    contract,
    earned,
    rate: (earned / contract) * 100,
    planned,
    actual,
    gap: actual - planned,
    monthly,
    counts,
  };
}

export const monthsOf = (rows: Row[]): string[] => [...new Set(rows.map((r) => r.month))].sort();

export interface TrendPoint {
  month: string;
  summary: Summary | null;
}

/** 같은 지역·유형·현장 필터로 시작 월~선택 월까지 매월 따로 집계 */
export function trendOf(rows: Row[], filter: Filter, index: RowIndex): TrendPoint[] {
  return monthsOf(rows)
    .filter((m) => m <= filter.month)
    .map((month) => ({ month, summary: summarize(scopeRowsForMonth(rows, filter, month), index) }));
}
