import { describe, expect, it } from 'vitest';
import { buildIndex, rankSites, statusOf } from '@/lib/calc';
import { buildCsv, EXPORT_COLUMNS, parseCsvText } from '@/lib/csv';
import { scopeRows } from '@/lib/filter';
import { COLUMNS, type Filter, type Row } from '@/lib/types';
import { validateCsv } from '@/lib/validate';
import { loadCsvRows } from './helpers';

const rows = loadCsvRows();
const index = buildIndex(rows);
const all = (month: string): Filter => ({ month, region: '', type: '', site: '' });
const exportOf = (f: Filter) => buildCsv(scopeRows(rows, f), index);
const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

describe('점검 순위', () => {
  it('9월 전체 점검 순서는 D(-10.7) → I(-7.6) → K(-5.4)', () => {
    const ranked = rankSites(scopeRows(rows, all('2026-09')), index);
    const bad = ranked.filter((x) => x.m.status === '점검');
    expect(bad.map((x) => x.row.siteId)).toEqual(['D', 'I', 'K']);
    expect(bad.map((x) => Math.round(x.m.gap * 10) / 10)).toEqual([-10.7, -7.6, -5.4]);
  });

  it('전체 순서는 공정차이 오름차순이고 12개 현장이 모두 나온다', () => {
    const ranked = rankSites(scopeRows(rows, all('2026-09')), index);
    expect(ranked).toHaveLength(12);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i].m.gap).toBeGreaterThanOrEqual(ranked[i - 1].m.gap);
  });

  it('공정차이가 같으면 현장 ID 순', () => {
    const mk = (siteId: string, planned: number, actual: number): Row => ({
      ...rows[0], month: '2026-09', siteId, plannedProgress: planned, actualProgress: actual,
    });
    const ranked = rankSites([mk('C', 50, 45), mk('A', 60, 55), mk('B', 70, 65)], buildIndex([]));
    expect(ranked.map((x) => x.row.siteId)).toEqual(['A', 'B', 'C']);
    expect(ranked.every((x) => x.m.status === '점검')).toBe(true);
  });

  it('9월 인천·공동주택에는 점검 현장이 없다(점검 대상 없음)', () => {
    const f = { ...all('2026-09'), region: '인천', type: '공동주택' };
    const ranked = rankSites(scopeRows(rows, f), index);
    expect(ranked.filter((x) => x.m.status === '점검')).toEqual([]);
    expect(statusOf(ranked[0].m.gap)).toBe('정상');
  });
});

describe('CSV 내보내기', () => {
  it('9월 D만: BOM, 헤더 + 데이터 1행, 원본 15열 + 계산 4열', () => {
    const csv = exportOf({ ...all('2026-09'), site: 'D' });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const l = lines(csv);
    expect(l).toHaveLength(2);
    const p = parseCsvText(csv);
    expect(p.headers).toEqual([...EXPORT_COLUMNS]);
    expect(p.headers).toHaveLength(19);
    const r = p.records[0];
    expect(r.siteId).toBe('D');
    expect(r.progressRate).toBe('69.4');
    expect(r.progressGap).toBe('-10.7');
    expect(r.status).toBe('점검');
    expect(r.monthlyEarned).toBe('3339.6');
    expect(r.siteName).toBe('[가상] 김포 공동주택 신축');
  });

  it('9월 인천·공동주택: 헤더 + A·G 2행', () => {
    const csv = exportOf({ ...all('2026-09'), region: '인천', type: '공동주택' });
    expect(lines(csv)).toHaveLength(3);
    expect(parseCsvText(csv).records.map((r) => r.siteId)).toEqual(['A', 'G']);
  });

  it('2025-10: 전월이 없어 당월기성액 칸이 비어 있다(0이 아님)', () => {
    const p = parseCsvText(exportOf(all('2025-10')));
    expect(p.records).toHaveLength(12);
    expect(p.records.every((r) => r.monthlyEarned === '')).toBe(true);
  });

  it('J의 7월 당월기성액 0.0은 빈 칸이 아니라 0으로 내보낸다', () => {
    const p = parseCsvText(exportOf({ ...all('2026-07'), site: 'J' }));
    expect(p.records[0].monthlyEarned).toBe('0');
  });

  it('범위에 자료가 없으면 헤더만 나온다(화면에서는 내보내기 전에 안내)', () => {
    expect(lines(exportOf({ ...all('2026-09'), region: '인천', type: '생산시설' }))).toHaveLength(1);
  });

  it('원본 15열은 값 그대로이고, 내보낸 파일을 다시 가져와도 같은 행이 된다', () => {
    const f = all('2026-09');
    const csv = exportOf(f);
    const back = validateCsv(csv);
    // 단일 월이라 월 누락·감소 검사는 해당 없음, 15열 값은 원본과 동일
    expect(back.ok).toBe(true);
    expect(back.rows).toEqual(scopeRows(rows, f));
    expect(COLUMNS).toHaveLength(15);
  });

  it('쉼표·따옴표가 든 글자는 따옴표로 감싼다', () => {
    const odd: Row = { ...rows[0], issueSummary: '하나, "둘"' };
    const csv = buildCsv([odd], buildIndex([odd]));
    expect(parseCsvText(csv).records[0].issueSummary).toBe('하나, "둘"');
  });

  it('필터가 같으면 화면 범위와 내보내기 범위가 같다', () => {
    const f = { ...all('2026-09'), region: '경기' };
    const ids = parseCsvText(exportOf(f)).records.map((r) => r.siteId);
    expect(ids).toEqual(scopeRows(rows, f).map((r) => r.siteId));
  });
});
