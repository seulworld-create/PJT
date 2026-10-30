import { describe, expect, it } from 'vitest';
import { parseCsvText } from '@/lib/csv';
import { formatIssue, validateCsv, validateFileText, validateJson, validateRecords } from '@/lib/validate';
import { COLUMNS } from '@/lib/types';
import { loadCsvRows, loadJsonRows, readData } from './helpers';

describe('정상 원본', () => {
  it('CSV는 144행·15개 열이고 오류·경고가 없다', () => {
    const r = validateCsv(readData('현장공정기성.csv'));
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(144);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(Object.values(r.columnStatus).every((s) => s === 'ok')).toBe(true);
    expect(COLUMNS).toHaveLength(15);
  });

  it('JSON도 144행이고 CSV와 내용이 같다', () => {
    const r = validateJson(readData('현장공정기성.json'));
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(144);
    expect(loadJsonRows()).toEqual(loadCsvRows());
  });

  it('CSV 다음 JSON을 가져와도 누적되지 않고 144행(전체 교체)', () => {
    let current = loadCsvRows();
    expect(current).toHaveLength(144);
    current = loadJsonRows(); // 적용 = 전체 교체
    expect(current).toHaveLength(144);
  });
});

describe('고의 오류 파일 3종은 모두 거부', () => {
  it('오류_공정률101.csv: 범위 오류, 위치가 파일 134줄', () => {
    const r = validateCsv(readData('검증용_오류데이터', '오류_공정률101.csv'));
    expect(r.ok).toBe(false);
    expect(r.rows).toEqual([]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ column: 'actualProgress', fileRow: 134 });
    expect(formatIssue(r.errors[0])).toContain('범위를 벗어났습니다');
    expect(r.columnStatus.actualProgress).toBe('error');
  });

  it('오류_공정률빈값.csv: 필수값 오류, 0으로 바꾸지 않음', () => {
    const r = validateCsv(readData('검증용_오류데이터', '오류_공정률빈값.csv'));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ column: 'actualProgress', fileRow: 134 });
    expect(formatIssue(r.errors[0])).toContain('비어 있습니다');
    expect(r.rows).toEqual([]);
  });

  it('오류_중복키.csv: 145행 중 중복 키 거부, 파일 146줄', () => {
    const r = validateCsv(readData('검증용_오류데이터', '오류_중복키.csv'));
    expect(r.ok).toBe(false);
    expect(r.recordCount).toBe(145);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].fileRow).toBe(146);
    expect(formatIssue(r.errors[0])).toContain('2026-09/D');
  });
});

describe('그 밖의 검사', () => {
  const base = () => loadCsvRows().map((r) => ({ ...r }) as Record<string, unknown>);

  it('계약금액 0은 거부', () => {
    const recs = base();
    recs[0].contractAmount = 0;
    const r = validateRecords(recs);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.column === 'contractAmount')).toBe(true);
  });

  it('같은 현장의 현장명이 월마다 다르면 거부', () => {
    const recs = base();
    recs[20].siteName = '[가상] 다른 이름';
    const r = validateRecords(recs);
    expect(r.errors.some((e) => e.column === 'siteName')).toBe(true);
  });

  it('누적기성액이 전월보다 줄면 거부', () => {
    const recs = base();
    const i = recs.findIndex((x) => x.month === '2026-09' && x.siteId === 'A');
    recs[i].cumulativeEarned = 1000;
    const r = validateRecords(recs);
    expect(r.errors.some((e) => e.column === 'cumulativeEarned' && /줄어들 수 없습니다/.test(e.message))).toBe(true);
  });

  it('누적기성액이 계약금액보다 크면 거부', () => {
    const recs = base();
    recs[0].cumulativeEarned = 999999999;
    expect(validateRecords(recs).ok).toBe(false);
  });

  it('날짜 형식·착공일/준공일 순서 오류 거부', () => {
    const a = base();
    a[0].startDate = '2024/11/01';
    expect(validateRecords(a).errors.some((e) => e.column === 'startDate')).toBe(true);
    const b = base();
    b[0].contractEndDate = '2020-01-01';
    expect(validateRecords(b).errors.some((e) => e.column === 'contractEndDate')).toBe(true);
  });

  it('숫자가 아닌 값은 거부', () => {
    const recs = base();
    recs[0].plannedProgress = 'abc';
    expect(validateRecords(recs).errors.some((e) => /숫자가 아닙니다/.test(e.message))).toBe(true);
  });

  it('월이 빠진 자료는 오류가 아니라 경고', () => {
    const recs = base().filter((x) => !(x.month === '2026-03' && x.siteId === 'B'));
    const r = validateRecords(recs);
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(143);
    expect(r.warnings.join(' ')).toContain('2026-03');
  });

  it('CSV에 열이 빠지면 어떤 열인지 알려 주며 거부', () => {
    const csv = readData('현장공정기성.csv').replace('actionPlan', 'etc');
    const r = validateCsv(csv);
    expect(r.ok).toBe(false);
    expect(r.errors[0].column).toBe('actionPlan');
  });

  it('JSON metadata가 맞지 않으면 거부', () => {
    const obj = JSON.parse(readData('현장공정기성.json'));
    obj.metadata.schemaVersion = '1.0';
    expect(validateJson(JSON.stringify(obj)).ok).toBe(false);
    expect(validateJson('{깨진 json').ok).toBe(false);
  });

  it('CSV·JSON 외 확장자는 거부', () => {
    expect(validateFileText('자료.xlsx', 'x').ok).toBe(false);
  });

  it('따옴표 안의 쉼표를 한 칸으로 읽는다', () => {
    const p = parseCsvText('a,b\r\n"x,y","he said ""hi"""\r\n');
    expect(p.records[0]).toEqual({ a: 'x,y', b: 'he said "hi"' });
  });
});
