export const COLUMNS = [
  'month',
  'siteId',
  'siteName',
  'contractAmount',
  'plannedProgress',
  'actualProgress',
  'cumulativeEarned',
  'region',
  'projectType',
  'startDate',
  'contractEndDate',
  'currentWork',
  'issueCategory',
  'issueSummary',
  'actionPlan',
] as const;

export type Column = (typeof COLUMNS)[number];

/** 자료 한 행 = 한 현장의 한 달 월말 상태 (고유 키: month + siteId) */
export interface Row {
  month: string;
  siteId: string;
  siteName: string;
  contractAmount: number;
  plannedProgress: number;
  actualProgress: number;
  cumulativeEarned: number;
  region: string;
  projectType: string;
  startDate: string;
  contractEndDate: string;
  currentWork: string;
  issueCategory: string;
  issueSummary: string;
  actionPlan: string;
}

export type Status = '정상' | '주의' | '점검';

/** 빈 문자열('')은 "전체"를 뜻한다 */
export interface Filter {
  month: string;
  region: string;
  type: string;
  site: string;
}

export const REGIONS = ['인천', '경기', '충남', '충북', '세종', '강원', '대전'];
export const PROJECT_TYPES = ['공동주택', '물류시설', '업무시설', '상업시설', '생산시설'];
export const MONTH_MIN = '2025-10';
export const MONTH_MAX = '2026-09';
export const DEFAULT_MONTH = '2026-09';
