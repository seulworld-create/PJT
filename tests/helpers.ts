import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validateCsv, validateJson } from '@/lib/validate';

const dataDir = path.resolve(__dirname, '..', 'data');
export const readData = (...p: string[]) => readFileSync(path.join(dataDir, ...p), 'utf8');

export function loadCsvRows() {
  const r = validateCsv(readData('현장공정기성.csv'));
  if (!r.ok) throw new Error('정상 CSV가 검사를 통과하지 못했습니다');
  return r.rows;
}

export function loadJsonRows() {
  const r = validateJson(readData('현장공정기성.json'));
  if (!r.ok) throw new Error('정상 JSON이 검사를 통과하지 못했습니다');
  return r.rows;
}
