import { describe, expect, it } from 'vitest';
import { defaultFilter, normalizeFilter, regionOptions, siteOptions, typeOptions } from '@/lib/filter';
import { loadCsvRows } from './helpers';

const rows = loadCsvRows();

describe('필터', () => {
  it('처음에는 2026-09·전체 지역·전체 유형·전체 현장', () => {
    expect(defaultFilter(rows)).toEqual({ month: '2026-09', region: '', type: '', site: '' });
  });

  it('지역·유형을 바꿔 선택 현장이 빠지면 현장을 전체로 되돌린다', () => {
    const r = normalizeFilter(rows, { month: '2026-09', region: '경기', type: '', site: 'A' });
    expect(r.siteReset).toBe(true);
    expect(r.filter.site).toBe('');
  });

  it('선택 현장이 범위 안이면 그대로 둔다', () => {
    const r = normalizeFilter(rows, { month: '2026-09', region: '인천', type: '공동주택', site: 'A' });
    expect(r.siteReset).toBe(false);
    expect(r.filter.site).toBe('A');
  });

  it('현장 목록은 고른 지역·유형에 해당하는 현장만', () => {
    const f = { month: '2026-09', region: '인천', type: '공동주택', site: '' };
    expect(siteOptions(rows, f).map((s) => s.id)).toEqual(['A', 'G']);
  });

  it('지역·유형 목록은 정해진 순서로 7개·5개', () => {
    expect(regionOptions(rows)).toEqual(['인천', '경기', '충남', '충북', '세종', '강원', '대전']);
    expect(typeOptions(rows)).toEqual(['공동주택', '물류시설', '업무시설', '상업시설', '생산시설']);
  });
});
