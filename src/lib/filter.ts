import { DEFAULT_MONTH, PROJECT_TYPES, REGIONS, type Filter, type Row } from './types';

const months = (rows: Row[]) => [...new Set(rows.map((r) => r.month))].sort();

/** 처음 상태: 2026-09(없으면 가장 늦은 월)·지역·유형·현장 모두 전체 */
export function defaultFilter(rows: Row[]): Filter {
  const ms = months(rows);
  const month = ms.includes(DEFAULT_MONTH) ? DEFAULT_MONTH : (ms[ms.length - 1] ?? DEFAULT_MONTH);
  return { month, region: '', type: '', site: '' };
}

const inRegionType = (r: Row, f: Filter) =>
  (f.region === '' || r.region === f.region) && (f.type === '' || r.projectType === f.type);

/** 선택 월 + 지역·유형·현장에 해당하는 행 */
export function scopeRows(rows: Row[], f: Filter): Row[] {
  return scopeRowsForMonth(rows, f, f.month);
}

export function scopeRowsForMonth(rows: Row[], f: Filter, month: string): Row[] {
  return rows.filter((r) => r.month === month && inRegionType(r, f) && (f.site === '' || r.siteId === f.site));
}

/** 지역·유형을 바꿔 선택 현장이 범위에서 빠지면 현장을 전체로 되돌린다 */
export function normalizeFilter(rows: Row[], f: Filter): { filter: Filter; siteReset: boolean } {
  if (f.site !== '' && !rows.some((r) => r.siteId === f.site && inRegionType(r, f))) {
    return { filter: { ...f, site: '' }, siteReset: true };
  }
  return { filter: f, siteReset: false };
}

const orderOf = (list: string[], v: string) => {
  const i = list.indexOf(v);
  return i === -1 ? list.length : i;
};

export function regionOptions(rows: Row[]): string[] {
  return [...new Set(rows.map((r) => r.region))].sort((a, b) => orderOf(REGIONS, a) - orderOf(REGIONS, b));
}

export function typeOptions(rows: Row[]): string[] {
  return [...new Set(rows.map((r) => r.projectType))].sort(
    (a, b) => orderOf(PROJECT_TYPES, a) - orderOf(PROJECT_TYPES, b),
  );
}

/** 현장 선택 목록: 고른 지역·유형에 해당하는 현장만 */
export function siteOptions(rows: Row[], f: Filter): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const r of rows) if (inRegionType(r, f) && !map.has(r.siteId)) map.set(r.siteId, r.siteName);
  return [...map].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, name]) => ({ id, name }));
}
