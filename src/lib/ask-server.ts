import type { AskFailure, AskResponse, AskSuccess } from './ask-types';
import { isPayload, MAX_QUESTION, MODEL, RECORD_FIELDS, SYSTEM_PROMPT, userContent, type AiPayload } from './prompt';

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
export const TIMEOUT_MS = 30_000;
const MAX_BODY = 300_000;

const STATUS: Record<AskFailure['code'], number> = {
  no_key: 503,
  bad_key: 502,
  quota: 429,
  timeout: 504,
  failed: 502,
  bad_request: 400,
  network: 502,
};

const MESSAGES: Record<AskFailure['code'], string> = {
  no_key: 'API 키가 설정되지 않았습니다. .env.local의 GEMINI_API_KEY를 확인하세요.',
  bad_key: 'API 키가 올바르지 않거나 권한이 없습니다.',
  quota: 'AI 사용 한도를 넘었습니다. 잠시 뒤 다시 시도하세요.',
  timeout: 'AI 응답이 제한 시간(30초)을 넘었습니다.',
  failed: 'AI 서버에서 오류가 났습니다.',
  bad_request: '질문 또는 자료의 형식이 올바르지 않습니다.',
  network: 'AI 서버에 연결하지 못했습니다.',
};

/** 키·상류 오류 내용은 담지 않고 정해진 문구만 돌려준다 */
function fail(code: AskFailure['code']): Response {
  const body: AskFailure = { ok: false, code, message: MESSAGES[code] };
  return Response.json(body, { status: STATUS[code] });
}

function payloadMonths(p: AiPayload): Set<string> {
  const s = new Set<string>([p.scope.month]);
  p.computed.monthlySummary.forEach((m) => s.add(m.month));
  p.siteHistory?.forEach((h) => s.add(String(h.rawRecord.month)));
  p.rawRecords.forEach((r) => s.add(String(r.month)));
  return s;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** 모델 출력(JSON 글자)을 읽어, 전달한 자료에 없는 현장·월·필드는 걷어낸다 */
export function parseModelText(text: string, payload: AiPayload): Omit<AskSuccess, 'ok' | 'mock'> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const j = JSON.parse(cleaned) as { answer?: unknown; sites?: unknown; months?: unknown; fields?: unknown };
    if (typeof j.answer === 'string' && j.answer.trim() !== '') {
      const siteIds = new Set(payload.rawRecords.map((r) => String(r.siteId)));
      const months = payloadMonths(payload);
      return {
        answer: j.answer.trim(),
        sites: strings(j.sites).filter((x) => siteIds.has(x)),
        months: strings(j.months).filter((x) => months.has(x)),
        fields: strings(j.fields).filter((x) => RECORD_FIELDS.includes(x)),
      };
    }
  } catch {
    /* JSON이 아니면 글자 그대로 쓴다 */
  }
  return { answer: text.trim(), sites: [], months: [], fields: [] };
}

/** 모의 응답: 진짜 AI가 아니며 화면에 "모의 응답"이라고 표시된다 */
function mockAnswer(question: string, payload: AiPayload): AskSuccess {
  const first = payload.rawRecords[0];
  const comp = payload.computed.selectedMonth.find((c) => c.siteId === first?.siteId);
  if (/준공일|미수금/.test(question)) {
    return {
      ok: true,
      mock: true,
      answer: `[모의 응답] 실제 준공일과 미수금은 자료에 없어 알 수 없습니다. 자료에 있는 것은 계약상 준공일(${first?.contractEndDate ?? '자료 없음'})이며, 실제 완료일이 아닙니다.`,
      sites: first ? [String(first.siteId)] : [],
      months: [payload.scope.month],
      fields: ['contractEndDate'],
    };
  }
  return {
    ok: true,
    mock: true,
    answer: `[모의 응답] ${payload.scope.month} ${first?.siteId ?? ''} 현장: 공정차이 ${comp?.progressGap ?? '계산 불가'}pp(${comp?.status ?? ''}). 기록된 상황: ${first?.issueSummary ?? '기록 없음'} 기록된 대응 계획: ${first?.actionPlan ?? '기록 없음'}`,
    sites: first ? [String(first.siteId)] : [],
    months: [payload.scope.month],
    fields: ['issueSummary', 'actionPlan'],
  };
}

export async function handleAsk(req: Request): Promise<Response> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return fail('bad_request');
  }
  if (raw.length > MAX_BODY) return fail('bad_request');

  let body: { question?: unknown; payload?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail('bad_request');
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (question === '' || question.length > MAX_QUESTION || !isPayload(body.payload)) return fail('bad_request');
  const payload = body.payload;

  if (process.env.AI_MOCK === '1') {
    return Response.json(mockAnswer(question, payload) satisfies AskResponse);
  }

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return fail('no_key');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userContent(question, payload) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      console.error('[ask] Gemini 응답 오류, 상태 코드:', res.status);
      if (res.status === 429) return fail('quota');
      if (res.status === 401 || res.status === 403) return fail('bad_key');
      if (res.status === 400) {
        const t = await res.text().catch(() => '');
        return fail(/API[ _]?KEY/i.test(t) ? 'bad_key' : 'failed');
      }
      return fail('failed');
    }

    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (text.trim() === '') return fail('failed');
    const parsed = parseModelText(text, payload);
    return Response.json({ ok: true, mock: false, ...parsed } satisfies AskResponse);
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'AbortError' || name === 'TimeoutError') return fail('timeout');
    console.error('[ask] 연결 오류:', name ?? 'unknown');
    return fail('network');
  } finally {
    clearTimeout(timer);
  }
}
