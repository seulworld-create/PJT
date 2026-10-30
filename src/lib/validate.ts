import { parseCsvText } from './csv';
import {
  COLUMNS,
  MONTH_MAX,
  MONTH_MIN,
  PROJECT_TYPES,
  REGIONS,
  type Column,
  type Row,
} from './types';

export interface ValidationIssue {
  /** 데이터 n번째 행 (헤더 제외, 1부터). 파일 전체 문제면 null */
  row: number | null;
  /** CSV일 때 파일의 몇 번째 줄인지 */
  fileRow: number | null;
  column: string | null;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  /** 오류가 없을 때만 채워진다 */
  rows: Row[];
  errors: ValidationIssue[];
  warnings: string[];
  columnStatus: Record<Column, 'ok' | 'error'>;
  /** 검사한 행 수 */
  recordCount: number;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const SITE_ID_RE = /^[A-L]$/;
const EPS = 1e-9;

const SITE_FIXED: Column[] = [
  'siteName',
  'region',
  'projectType',
  'contractAmount',
  'startDate',
  'contractEndDate',
];

export function formatIssue(e: ValidationIssue): string {
  const where =
    e.row === null
      ? ''
      : e.fileRow !== null
        ? `데이터 ${e.row}번째 행(파일 ${e.fileRow}줄)`
        : `데이터 ${e.row}번째 행`;
  const col = e.column ? ` ${e.column}` : '';
  const head = where || col ? `${where}${col}: ` : '';
  return `${head}${e.message}`.trim();
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    return NUM_RE.test(t) ? Number(t) : null;
  }
  return null;
}

function toText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return v.trim() === '' ? null : v.trim();
}

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function emptyStatus(): Record<Column, 'ok' | 'error'> {
  return Object.fromEntries(COLUMNS.map((c) => [c, 'ok'])) as Record<Column, 'ok' | 'error'>;
}

function fail(errors: ValidationIssue[], recordCount: number): ValidationResult {
  const columnStatus = emptyStatus();
  for (const e of errors) if (e.column && e.column in columnStatus) columnStatus[e.column as Column] = 'error';
  return { ok: false, rows: [], errors, warnings: [], columnStatus, recordCount };
}

interface Typed {
  idx: number; // 0부터
  fileRow: number | null;
  row: Row;
}

/** 이미 글자·숫자로 읽은 기록들을 검사한다 (CSV·JSON 공통) */
export function validateRecords(
  records: Record<string, unknown>[],
  fileRows: (number | null)[] = [],
  extraErrors: ValidationIssue[] = [],
): ValidationResult {
  const errors: ValidationIssue[] = [...extraErrors];
  const warnings: string[] = [];
  const typed: Typed[] = [];

  if (records.length === 0) {
    errors.push({ row: null, fileRow: null, column: null, message: '자료가 한 행도 없습니다.' });
  }

  const add = (i: number, column: Column | null, message: string) =>
    errors.push({ row: i + 1, fileRow: fileRows[i] ?? null, column, message });

  records.forEach((rec, i) => {
    const before = errors.length;
    const text = (c: Column): string => {
      const t = toText(rec[c]);
      if (t === null) {
        add(i, c, rec[c] === undefined || rec[c] === null || rec[c] === '' || typeof rec[c] === 'string'
          ? '값이 비어 있습니다(빈칸을 0으로 바꾸지 않습니다).'
          : '글자가 아닙니다.');
        return '';
      }
      return t;
    };
    const num = (c: Column): number => {
      const raw = rec[c];
      if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
        add(i, c, '값이 비어 있습니다(빈칸을 0으로 바꾸지 않습니다).');
        return NaN;
      }
      const n = toNumber(raw);
      if (n === null) {
        add(i, c, `숫자가 아닙니다(${String(raw)}).`);
        return NaN;
      }
      return n;
    };

    const month = text('month');
    const siteId = text('siteId');
    const siteName = text('siteName');
    const contractAmount = num('contractAmount');
    const plannedProgress = num('plannedProgress');
    const actualProgress = num('actualProgress');
    const cumulativeEarned = num('cumulativeEarned');
    const region = text('region');
    const projectType = text('projectType');
    const startDate = text('startDate');
    const contractEndDate = text('contractEndDate');
    const currentWork = text('currentWork');
    const issueCategory = text('issueCategory');
    const issueSummary = text('issueSummary');
    const actionPlan = text('actionPlan');

    if (month && (!MONTH_RE.test(month) || month < MONTH_MIN || month > MONTH_MAX))
      add(i, 'month', `${month}은(는) 올바른 월이 아닙니다(${MONTH_MIN}~${MONTH_MAX}, YYYY-MM).`);
    if (siteId && !SITE_ID_RE.test(siteId)) add(i, 'siteId', `${siteId}은(는) 올바른 현장 ID가 아닙니다(A~L).`);
    if (siteName && !siteName.includes('[가상]')) add(i, 'siteName', '현장명에 [가상] 표시가 없습니다.');
    if (!Number.isNaN(contractAmount) && contractAmount <= 0)
      add(i, 'contractAmount', `${contractAmount}은(는) 0보다 커야 합니다.`);
    for (const [c, v] of [
      ['plannedProgress', plannedProgress],
      ['actualProgress', actualProgress],
    ] as const) {
      if (!Number.isNaN(v) && (v < 0 || v > 100)) add(i, c, `${v}은(는) 범위를 벗어났습니다(0~100만 가능).`);
    }
    if (!Number.isNaN(cumulativeEarned)) {
      if (cumulativeEarned < 0) add(i, 'cumulativeEarned', `${cumulativeEarned}은(는) 0 이상이어야 합니다.`);
      else if (!Number.isNaN(contractAmount) && contractAmount > 0 && cumulativeEarned > contractAmount + EPS)
        add(i, 'cumulativeEarned', `누적기성액 ${cumulativeEarned}이(가) 계약금액 ${contractAmount}보다 큽니다.`);
    }
    if (region && !REGIONS.includes(region)) add(i, 'region', `${region}은(는) 정해진 지역이 아닙니다.`);
    if (projectType && !PROJECT_TYPES.includes(projectType))
      add(i, 'projectType', `${projectType}은(는) 정해진 공사 유형이 아닙니다.`);

    let startOk = false;
    let endOk = false;
    if (startDate) {
      startOk = validDate(startDate);
      if (!startOk) add(i, 'startDate', `${startDate}은(는) 올바른 날짜가 아닙니다(YYYY-MM-DD).`);
    }
    if (contractEndDate) {
      endOk = validDate(contractEndDate);
      if (!endOk) add(i, 'contractEndDate', `${contractEndDate}은(는) 올바른 날짜가 아닙니다(YYYY-MM-DD).`);
    }
    if (startOk && endOk && startDate >= contractEndDate)
      add(i, 'contractEndDate', '계약상 준공일이 착공일보다 늦어야 합니다.');
    if (startOk && month && MONTH_RE.test(month) && monthEnd(month) < startDate)
      add(i, 'startDate', `${month} 월말이 착공일(${startDate})보다 앞섭니다.`);

    if (errors.length === before) {
      typed.push({
        idx: i,
        fileRow: fileRows[i] ?? null,
        row: {
          month, siteId, siteName, contractAmount, plannedProgress, actualProgress, cumulativeEarned,
          region, projectType, startDate, contractEndDate, currentWork, issueCategory, issueSummary, actionPlan,
        },
      });
    }
  });

  // ── 행 사이의 검사 ──
  const seen = new Map<string, number>();
  const unique: Typed[] = [];
  for (const t of typed) {
    const key = `${t.row.month}|${t.row.siteId}`;
    const first = seen.get(key);
    if (first !== undefined) {
      add(t.idx, 'siteId', `${t.row.month}/${t.row.siteId}이(가) 데이터 ${first + 1}번째 행과 중복입니다(같은 월·현장 중복 금지).`);
    } else {
      seen.set(key, t.idx);
      unique.push(t);
    }
  }

  const bySite = new Map<string, Typed[]>();
  for (const t of unique) {
    const list = bySite.get(t.row.siteId) ?? [];
    list.push(t);
    bySite.set(t.row.siteId, list);
  }

  for (const [siteId, list] of bySite) {
    const ref = [...list].sort((a, b) => a.idx - b.idx)[0];
    for (const t of list) {
      if (t === ref) continue;
      for (const c of SITE_FIXED) {
        if (t.row[c as keyof Row] !== ref.row[c as keyof Row])
          add(t.idx, c, `현장 ${siteId}의 ${c} 값이 다른 행(${ref.row[c as keyof Row]})과 다릅니다. 같은 현장은 전 기간 같아야 합니다.`);
      }
    }
    const sorted = [...list].sort((a, b) => (a.row.month < b.row.month ? -1 : 1));
    for (let k = 1; k < sorted.length; k++) {
      const prev = sorted[k - 1].row;
      const cur = sorted[k].row;
      for (const c of ['plannedProgress', 'actualProgress', 'cumulativeEarned'] as const) {
        if (cur[c] < prev[c] - EPS)
          add(sorted[k].idx, c, `현장 ${siteId}의 ${cur.month} 값(${cur[c]})이 ${prev.month}(${prev[c]})보다 작습니다. 누적값은 줄어들 수 없습니다.`);
      }
    }
  }

  // 월 누락은 오류가 아니라 경고
  if (unique.length > 0) {
    const months = unique.map((t) => t.row.month).sort();
    const first = months[0];
    const last = months[months.length - 1];
    for (const [siteId, list] of [...bySite].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const have = new Set(list.map((t) => t.row.month));
      const missing: string[] = [];
      for (let m = first; m <= last; m = nextMonth(m)) if (!have.has(m)) missing.push(m);
      if (missing.length > 0)
        warnings.push(`현장 ${siteId}의 ${missing.join(', ')} 행이 없습니다. 확인 가능한 행만 집계하며, 전월이 없는 달의 당월기성액은 계산 불가입니다.`);
    }
  }

  errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  const columnStatus = emptyStatus();
  for (const e of errors) if (e.column && e.column in columnStatus) columnStatus[e.column as Column] = 'error';

  const ok = errors.length === 0 && typed.length > 0;
  return {
    ok,
    rows: ok ? typed.sort((a, b) => a.idx - b.idx).map((t) => t.row) : [],
    errors,
    warnings,
    columnStatus,
    recordCount: records.length,
  };
}

export function validateCsv(text: string): ValidationResult {
  const parsed = parseCsvText(text);
  const missing = COLUMNS.filter((c) => !parsed.headers.includes(c));
  if (missing.length > 0) {
    return fail(
      missing.map((c) => ({ row: null, fileRow: 1, column: c, message: '이 열이 파일에 없습니다. 15개 열이 모두 필요합니다.' })),
      parsed.records.length,
    );
  }
  const shape: ValidationIssue[] = parsed.shapeErrors.map((s) => ({
    row: null,
    fileRow: s.fileRow,
    column: null,
    message: `파일 ${s.fileRow}줄의 열 개수가 ${s.got}개입니다(${s.want}개여야 합니다).`,
  }));
  return validateRecords(parsed.records, parsed.fileRows, shape);
}

export function validateJson(text: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return fail([{ row: null, fileRow: null, column: null, message: 'JSON 형식이 올바르지 않아 읽을 수 없습니다.' }], 0);
  }
  const obj = data as { metadata?: Record<string, unknown>; records?: unknown };
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.records)) {
    return fail([{ row: null, fileRow: null, column: null, message: 'JSON에 records(행 목록)가 없습니다.' }], 0);
  }
  const meta: ValidationIssue[] = [];
  const m = obj.metadata;
  const metaErr = (message: string) => meta.push({ row: null, fileRow: null, column: null, message });
  if (!m || typeof m !== 'object') {
    metaErr('JSON에 metadata(파일 정보)가 없습니다.');
  } else {
    if (m.schemaVersion !== '2.0') metaErr(`metadata.schemaVersion이 2.0이 아닙니다(${String(m.schemaVersion)}).`);
    if (m.moneyUnit !== '백만원') metaErr(`metadata.moneyUnit이 백만원이 아닙니다(${String(m.moneyUnit)}).`);
    if (m.progressUnit !== 'percent_0_100') metaErr(`metadata.progressUnit이 percent_0_100이 아닙니다(${String(m.progressUnit)}).`);
    const req = m.requiredFields;
    if (!Array.isArray(req) || COLUMNS.some((c) => !req.includes(c)))
      metaErr('metadata.requiredFields에 15개 열이 모두 들어 있지 않습니다.');
  }
  const records = (obj.records as unknown[]).map((r) =>
    r && typeof r === 'object' ? (r as Record<string, unknown>) : {},
  );
  return validateRecords(records, [], meta);
}

export function validateFileText(fileName: string, text: string): ValidationResult {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) return validateJson(text);
  if (lower.endsWith('.csv')) return validateCsv(text);
  return fail([{ row: null, fileRow: null, column: null, message: 'CSV 또는 JSON 파일만 가져올 수 있습니다.' }], 0);
}
