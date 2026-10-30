import { round1, siteMetrics, type RowIndex } from './calc';
import { COLUMNS, type Row } from './types';

export interface CsvParseResult {
  headers: string[];
  records: Record<string, string>[];
  /** records[i]가 파일의 몇 번째 줄인지 (헤더가 1줄) */
  fileRows: number[];
  /** 열 개수가 헤더와 다른 줄 */
  shapeErrors: { fileRow: number; got: number; want: number }[];
}

/** 따옴표·쉼표·줄바꿈을 처리하는 CSV 읽기. 앞쪽 BOM은 제거한다. */
export function parseCsvText(input: string): CsvParseResult {
  const text = input.replace(/^﻿/, '');
  const lines: string[][] = [];
  let field = '';
  let line: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      line.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      line.push(field);
      lines.push(line);
      field = '';
      line = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || line.length > 0) {
    line.push(field);
    lines.push(line);
  }

  const headers = (lines[0] ?? []).map((h) => h.trim());
  const records: Record<string, string>[] = [];
  const fileRows: number[] = [];
  const shapeErrors: CsvParseResult['shapeErrors'] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    if (cells.length === 1 && cells[0].trim() === '') continue; // 완전히 빈 줄
    if (cells.length !== headers.length) {
      shapeErrors.push({ fileRow: i + 1, got: cells.length, want: headers.length });
      continue;
    }
    const rec: Record<string, string> = {};
    headers.forEach((h, k) => (rec[h] = cells[k]));
    records.push(rec);
    fileRows.push(i + 1);
  }
  return { headers, records, fileRows, shapeErrors };
}

/** 내보내는 CSV: 원본 15개 열 + 프로그램이 계산한 4개 열 */
export const EXPORT_COLUMNS = [...COLUMNS, 'progressRate', 'progressGap', 'status', 'monthlyEarned'] as const;

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * 범위(scope) 행을 CSV 글자로 만든다. 숫자는 단위를 바꾸지 않고(백만원·%·pp),
 * 전월이 없어 계산할 수 없는 당월기성액은 빈 칸으로 둔다(0으로 쓰지 않는다).
 * 엑셀에서 한글이 깨지지 않도록 맨 앞에 BOM을 붙인다.
 */
export function buildCsv(scope: Row[], index: RowIndex): string {
  const lines = [EXPORT_COLUMNS.join(',')];
  for (const r of scope) {
    const m = siteMetrics(r, index);
    const cells = [
      ...COLUMNS.map((c) => String(r[c])),
      String(round1(m.rate)),
      String(round1(m.gap)),
      m.status,
      m.monthly === null ? '' : String(round1(m.monthly)),
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}