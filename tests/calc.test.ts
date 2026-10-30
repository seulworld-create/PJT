import { describe, expect, it } from 'vitest';
import {
  buildIndex,
  fmtPct,
  fmtPp,
  round1,
  siteMetrics,
  statusOf,
  summarize,
  trendOf,
} from '@/lib/calc';
import { defaultFilter, scopeRows } from '@/lib/filter';
import type { Filter } from '@/lib/types';
import { loadCsvRows } from './helpers';

const rows = loadCsvRows();
const index = buildIndex(rows);
const all = (month: string): Filter => ({ month, region: '', type: '', site: '' });
const sum = (f: Filter) => summarize(scopeRows(rows, f), index);

// 검산표 '월별 전체 현장': 월, 누적기성액, 기성률, 가중 계획, 가중 실제, 공정차이, 당월기성액, 정상, 주의, 점검
const monthly: [string, number, number, number, number, number, number | null, number, number, number][] = [
  ['2025-10', 105449.7, 16.7, 19.4, 19.6, 0.2, null, 10, 2, 0],
  ['2025-11', 125857.8, 20.0, 22.8, 23.2, 0.3, 20408.1, 10, 2, 0],
  ['2025-12', 148530.2, 23.6, 26.9, 27.0, 0.2, 22672.4, 9, 3, 0],
  ['2026-01', 173599.9, 27.5, 31.4, 31.3, -0.1, 25069.7, 9, 3, 0],
  ['2026-02', 202848.9, 32.2, 36.7, 36.2, -0.4, 29249.0, 8, 4, 0],
  ['2026-03', 233981.1, 37.1, 42.4, 41.6, -0.8, 31132.2, 8, 3, 1],
  ['2026-04', 266640.0, 42.3, 48.6, 47.1, -1.5, 32658.9, 8, 2, 2],
  ['2026-05', 300878.0, 47.7, 54.8, 52.9, -1.9, 34238.0, 8, 1, 3],
  ['2026-06', 335344.9, 53.2, 60.7, 58.3, -2.4, 34466.9, 7, 2, 3],
  ['2026-07', 364718.5, 57.8, 65.8, 63.2, -2.6, 29373.6, 6, 2, 4],
  ['2026-08', 395184.7, 62.7, 69.9, 67.6, -2.3, 30466.2, 6, 2, 4],
  ['2026-09', 424063.4, 67.2, 73.2, 71.2, -2.0, 28878.7, 6, 3, 3],
];

describe('검산표: 월별 전체 현장', () => {
  it.each(monthly)('%s', (month, earned, rate, planned, actual, gap, mon, ok, warn, bad) => {
    const s = sum(all(month))!;
    expect(s.contract).toBeCloseTo(630700, 6);
    expect(round1(s.earned)).toBe(earned);
    expect(round1(s.rate)).toBe(rate);
    expect(round1(s.planned)).toBe(planned);
    expect(round1(s.actual)).toBe(actual);
    expect(round1(s.gap)).toBe(gap);
    expect(s.monthly === null ? null : round1(s.monthly)).toBe(mon);
    expect([s.counts.정상, s.counts.주의, s.counts.점검]).toEqual([ok, warn, bad]);
  });

  it('2025-10 당월기성액은 계산 불가(null)이고 누적액으로 대신하지 않는다', () => {
    expect(sum(all('2025-10'))!.monthly).toBeNull();
  });

  it('9월 전체 공정차이는 반올림된 두 공정률을 다시 빼지 않고 계산한다', () => {
    const s = sum(all('2026-09'))!;
    expect(fmtPp(s.gap)).toBe('-2.0pp');
    expect(fmtPct(s.rate)).toBe('67.2%');
  });
});

// 검산표 '2026-09 현장별': ID, 계획, 실제, 차이, 누적기성액, 기성률, 당월기성액, 상태
const sept: [string, number, number, number, number, number, number, string][] = [
  ['A', 75.4, 77.1, 1.7, 63763.2, 73.8, 4665.6, '정상'],
  ['B', 80.3, 82.1, 1.8, 41395.2, 78.4, 3854.4, '정상'],
  ['C', 94.8, 96.2, 1.4, 41040.0, 95.0, 1166.4, '정상'],
  ['D', 86.5, 75.8, -10.7, 50384.4, 69.4, 3339.6, '점검'],
  ['E', 99.4, 99.7, 0.3, 18635.4, 98.6, 302.4, '정상'],
  ['F', 68.7, 65.3, -3.4, 22082.5, 60.5, 2117.0, '주의'],
  ['G', 52.8, 54.4, 1.6, 49448.7, 50.1, 3849.3, '정상'],
  ['H', 31.2, 29.4, -1.8, 11369.6, 27.2, 543.4, '주의'],
  ['I', 73.2, 65.6, -7.6, 34963.2, 60.7, 3052.8, '점검'],
  ['J', 95.8, 95.0, -0.8, 30034.8, 92.7, 1393.2, '주의'],
  ['K', 71.0, 65.6, -5.4, 39446.0, 60.5, 3586.0, '점검'],
  ['L', 88.1, 90.3, 2.2, 21500.4, 87.4, 1008.6, '정상'],
];

describe('검산표: 2026-09 현장별', () => {
  it.each(sept)('%s', (id, planned, actual, gap, earned, rate, mon, status) => {
    const r = rows.find((x) => x.month === '2026-09' && x.siteId === id)!;
    const m = siteMetrics(r, index);
    expect(r.plannedProgress).toBe(planned);
    expect(r.actualProgress).toBe(actual);
    expect(round1(m.gap)).toBe(gap);
    expect(round1(r.cumulativeEarned)).toBe(earned);
    expect(round1(m.rate)).toBe(rate);
    expect(round1(m.monthly!)).toBe(mon);
    expect(m.status).toBe(status);
  });

  it('J의 7월 당월기성액 0.0은 정상값(null이 아님)', () => {
    const j7 = rows.find((x) => x.month === '2026-07' && x.siteId === 'J')!;
    expect(siteMetrics(j7, index).monthly).toBe(0);
  });

  it('D의 공정차이는 8월 -11.2pp → 9월 -10.7pp', () => {
    const d = (m: string) => siteMetrics(rows.find((x) => x.month === m && x.siteId === 'D')!, index).gap;
    expect(round1(d('2026-08'))).toBe(-11.2);
    expect(round1(d('2026-09'))).toBe(-10.7);
  });
});

describe('상태 판정 경계값', () => {
  it('계획 70·실제 70 → 정상, 65.1 → 주의, 65 → 점검', () => {
    expect(statusOf(70 - 70)).toBe('정상');
    expect(statusOf(65.1 - 70)).toBe('주의');
    expect(statusOf(65 - 70)).toBe('점검');
  });
  it('0pp 미만은 주의, -5pp 이하는 점검 (부동소수 오차가 있어도)', () => {
    expect(statusOf(-0.0001)).toBe('주의');
    expect(statusOf(60.1 - 65.1)).toBe('점검');
  });
});

describe('검산표: 2026-09 지역별', () => {
  const region: [string, number, number, number, number, number, number, number][] = [
    ['인천', 2, 185100, 113211.9, 61.2, 2, 0, 0],
    ['경기', 4, 210400, 144189.2, 68.5, 2, 1, 1],
    ['충남', 2, 55400, 40717.9, 73.5, 1, 1, 0],
    ['충북', 1, 57600, 34963.2, 60.7, 0, 0, 1],
    ['세종', 1, 32400, 30034.8, 92.7, 0, 1, 0],
    ['강원', 1, 65200, 39446.0, 60.5, 0, 0, 1],
    ['대전', 1, 24600, 21500.4, 87.4, 1, 0, 0],
  ];
  it.each(region)('%s', (name, n, contract, earned, rate, ok, warn, bad) => {
    const s = sum({ ...all('2026-09'), region: name })!;
    expect(s.siteCount).toBe(n);
    expect(round1(s.contract)).toBe(contract);
    expect(round1(s.earned)).toBe(earned);
    expect(round1(s.rate)).toBe(rate);
    expect([s.counts.정상, s.counts.주의, s.counts.점검]).toEqual([ok, warn, bad]);
  });
});

describe('필터 범위와 추이', () => {
  it('9월 인천·공동주택은 A·G 2곳', () => {
    const f = { ...all('2026-09'), region: '인천', type: '공동주택' };
    expect(scopeRows(rows, f).map((r) => r.siteId)).toEqual(['A', 'G']);
  });

  it('범위에 현장이 없으면 요약은 null(0%로 대신하지 않음)', () => {
    expect(sum({ ...all('2026-09'), region: '인천', type: '생산시설' })).toBeNull();
  });

  it('9월 전체 추이는 12개월이고 마지막 점이 9월 값과 같다', () => {
    const t = trendOf(rows, defaultFilter(rows), index);
    expect(t).toHaveLength(12);
    expect(round1(t[11].summary!.actual)).toBe(71.2);
    expect(t[0].summary!.monthly).toBeNull();
  });

  it('추이는 선택 월까지만 표시한다', () => {
    expect(trendOf(rows, all('2026-03'), index)).toHaveLength(6);
  });

  it('현장 D만 고르면 한 현장의 값이 그대로 나온다', () => {
    const s = sum({ ...all('2026-09'), site: 'D' })!;
    expect(round1(s.rate)).toBe(69.4);
    expect(round1(s.monthly!)).toBe(3339.6);
  });
});

describe('표시 형식', () => {
  it('반올림은 마지막에 소수 첫째 자리', () => {
    expect(round1(0.25)).toBe(0.3);
    expect(round1(-0.25)).toBe(-0.3);
    expect(fmtPp(0.2)).toBe('+0.2pp');
    expect(fmtPp(-0.04)).toBe('0.0pp');
  });
});
