import { buildIndex, monthsOf, round1, siteMetrics, summarize, trendOf, type RowIndex } from './calc';
import { scopeRows, scopeRowsForMonth } from './filter';
import { COLUMNS, type Filter, type Row } from './types';

export const MODEL = 'gemini-3.8-flash';
export const MAX_QUESTION = 500;

/** AI가 "참고한 기록 필드"로 지정할 수 있는 이름 */
export const RECORD_FIELDS: readonly string[] = COLUMNS;

const r1 = (x: number | null) => (x === null ? null : round1(x));

type Raw = Record<(typeof COLUMNS)[number], string | number>;
const rawOf = (r: Row): Raw => Object.fromEntries(COLUMNS.map((c) => [c, r[c]])) as Raw;

export interface SiteComputed {
  siteId: string;
  progressRate: number;
  progressGap: number;
  status: string;
  /** null = 전월 자료가 없어 계산 불가 */
  monthlyEarned: number | null;
}

export interface MonthlySummaryItem {
  month: string;
  contractAmount: number;
  cumulativeEarned: number;
  progressRate: number;
  plannedProgress: number;
  actualProgress: number;
  progressGap: number;
  monthlyEarned: number | null;
  counts: { 정상: number; 주의: number; 점검: number };
}

/** 브라우저가 서버로 보내는 자료: 원문 기록과 프로그램이 계산한 값을 구분해서 담는다 */
export interface AiPayload {
  scope: { month: string; region: string; projectType: string; site: string };
  notes: string[];
  /** 원문 기록(자료 파일의 값 그대로) — 선택 월·범위 */
  rawRecords: Raw[];
  /** 프로그램이 계산한 값 */
  computed: {
    selectedMonth: SiteComputed[];
    overall: MonthlySummaryItem | null;
    /** 시작 월~선택 월 월별 요약(같은 지역·유형·현장 필터) */
    monthlySummary: MonthlySummaryItem[];
  };
  /** 현장 한 곳을 골랐을 때만: 시작 월~선택 월의 월별 원문 기록과 계산값 */
  siteHistory?: { rawRecord: Raw; computed: SiteComputed }[];
}

const computedOf = (r: Row, index: RowIndex): SiteComputed => {
  const m = siteMetrics(r, index);
  return { siteId: r.siteId, progressRate: round1(m.rate), progressGap: round1(m.gap), status: m.status, monthlyEarned: r1(m.monthly) };
};

function summaryItem(month: string, rows: Row[], index: RowIndex): MonthlySummaryItem | null {
  const s = summarize(rows, index);
  if (!s) return null;
  return {
    month,
    contractAmount: round1(s.contract),
    cumulativeEarned: round1(s.earned),
    progressRate: round1(s.rate),
    plannedProgress: round1(s.planned),
    actualProgress: round1(s.actual),
    progressGap: round1(s.gap),
    monthlyEarned: r1(s.monthly),
    counts: s.counts,
  };
}

/** 현재 필터 범위의 자료를 AI에 보낼 형태로 만든다. 범위에 현장이 없으면 null */
export function buildPayload(rows: Row[], filter: Filter, index: RowIndex): AiPayload | null {
  const scope = scopeRows(rows, filter);
  if (scope.length === 0) return null;

  const monthlySummary = trendOf(rows, filter, index)
    .map((p) => summaryItem(p.month, scopeRowsForMonth(rows, filter, p.month), index))
    .filter((x): x is MonthlySummaryItem => x !== null);

  const payload: AiPayload = {
    scope: {
      month: filter.month,
      region: filter.region || '전체',
      projectType: filter.type || '전체',
      site: filter.site || '전체',
    },
    notes: [
      '금액 단위는 백만원, 공정률·기성률은 %, 공정차이는 pp(실제-계획)입니다.',
      'monthlyEarned가 null이면 전월 자료가 없어 계산할 수 없다는 뜻입니다(0이 아님).',
      'rawRecords는 자료 파일의 원문 기록이고 computed는 프로그램이 계산한 값입니다.',
    ],
    rawRecords: scope.map(rawOf),
    computed: {
      selectedMonth: scope.map((r) => computedOf(r, index)),
      overall: summaryItem(filter.month, scope, index),
      monthlySummary,
    },
  };

  if (filter.site) {
    payload.siteHistory = rows
      .filter((r) => r.siteId === filter.site && r.month <= filter.month)
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .map((r) => ({ rawRecord: rawOf(r), computed: computedOf(r, index) }));
  }
  return payload;
}

export const SYSTEM_PROMPT = `너는 건설 현장 공정·기성 대시보드의 설명 도우미다. 사용자는 개발을 모르는 본사 공무팀 담당자다. 쉬운 한국어로 짧게 답한다.

[자료]
- 사용자 메시지의 JSON은 교육용 가상 자료다(실제 회사의 현장·계약이 아니다).
- rawRecords/siteHistory.rawRecord는 원문 기록이고, computed·monthlySummary는 프로그램이 이미 계산한 값이다.
- 숫자는 절대 새로 계산하거나 바꾸지 않는다. 전달된 computed 값을 그대로 인용한다.

[지켜야 할 규칙]
1. issueSummary는 "기록된 상황", actionPlan은 "기록된 대응 계획"이라고 부르며 기록된 내용을 그대로 옮겨 설명한다.
2. 기록된 상황이나 대응 계획을 원인 확정이나 완료·효과 사실로 바꾸지 않는다. ("~때문이다", "해결되었다"라고 단정하지 않는다.)
3. contractEndDate는 "계약상 준공일"이다. 실제 준공일·완료 예측·일정 예측은 자료가 없으므로 답하지 않는다.
4. 수금액·청구액·미수금·하도급 대금·기상 실측 등 자료에 없는 내용은 "자료에 없어 알 수 없습니다"라고 답한다. 짐작해서 숫자나 원인을 만들지 않는다.
5. 전달된 범위(scope) 밖의 월·현장을 물으면 전달된 자료 범위를 안내하고 숫자·원인을 만들지 않는다.
6. 상태(정상·주의·점검)는 computed.status를 따른다. issueCategory는 현장 기록 분류이며 상태 판정이 아니다.
7. monthlyEarned가 null이면 "계산 불가"라고 말한다. 누적기성액을 당월기성액으로 대신하지 않는다.
8. 추이·회복 여부는 monthlySummary나 siteHistory에 있는 월별 값으로만 말한다.

[출력] 반드시 아래 JSON 한 개만 출력한다.
{"answer":"사용자에게 보여 줄 답변(문단·줄바꿈 가능)","sites":["답변에 쓴 siteId"],"months":["답변에 쓴 YYYY-MM"],"fields":["답변에 참고한 원문 기록 필드 이름(예: issueSummary, actionPlan, contractEndDate)"]}
fields에는 자료의 15개 필드 이름만 쓴다. 참고한 원문 기록이 없으면 빈 배열로 둔다.`;

export function userContent(question: string, payload: AiPayload): string {
  return `질문: ${question}\n\n자료(JSON):\n${JSON.stringify(payload)}`;
}

/** 서버에 보내기 전에 모양이 맞는지 확인 */
export function isPayload(v: unknown): v is AiPayload {
  const p = v as AiPayload;
  return (
    !!p &&
    typeof p === 'object' &&
    !!p.scope &&
    typeof p.scope.month === 'string' &&
    Array.isArray(p.rawRecords) &&
    !!p.computed &&
    Array.isArray(p.computed.selectedMonth)
  );
}

export { buildIndex, monthsOf };
