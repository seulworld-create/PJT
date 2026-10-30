import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildIndex } from '@/lib/calc';
import { handleAsk, parseModelText, TIMEOUT_MS } from '@/lib/ask-server';
import { buildPayload, MAX_QUESTION, MODEL, type AiPayload } from '@/lib/prompt';
import type { Filter } from '@/lib/types';
import { loadCsvRows } from './helpers';

const rows = loadCsvRows();
const index = buildIndex(rows);
const f = (over: Partial<Filter> = {}): Filter => ({ month: '2026-09', region: '', type: '', site: '', ...over });
const payloadOf = (over: Partial<Filter> = {}) => buildPayload(rows, f(over), index)!;

describe('AI에 보낼 자료 구성', () => {
  it('현장 D를 고르면 원문 기록 1행과 프로그램 계산값이 따로 담긴다', () => {
    const p = payloadOf({ site: 'D' });
    expect(p.rawRecords).toHaveLength(1);
    expect(p.rawRecords[0]).toMatchObject({ siteId: 'D', month: '2026-09' });
    expect(String(p.rawRecords[0].issueSummary)).toContain('공급 정상화');
    expect(String(p.rawRecords[0].actionPlan)).toContain('주간');
    // 원문에는 계산값이 섞이지 않는다
    expect(Object.keys(p.rawRecords[0])).not.toContain('progressRate');
    expect(p.computed.selectedMonth[0]).toEqual({
      siteId: 'D', progressRate: 69.4, progressGap: -10.7, status: '점검', monthlyEarned: 3339.6,
    });
  });

  it('한 현장을 고르면 시작 월~선택 월의 월별 기록(siteHistory)을 함께 보낸다', () => {
    const p = payloadOf({ site: 'D' });
    expect(p.siteHistory).toHaveLength(12);
    const gaps = p.siteHistory!.filter((h) => ['2026-08', '2026-09'].includes(String(h.rawRecord.month))).map((h) => h.computed.progressGap);
    expect(gaps).toEqual([-11.2, -10.7]);
    expect(p.siteHistory![0].computed.monthlyEarned).toBeNull(); // 첫 달은 계산 불가(null)
  });

  it('J의 7월 기록이 siteHistory에 있고 당월기성액 0은 null이 아니다', () => {
    const p = payloadOf({ site: 'J', month: '2026-08' });
    const j7 = p.siteHistory!.find((h) => h.rawRecord.month === '2026-07')!;
    expect(j7.computed.monthlyEarned).toBe(0);
    expect(String(j7.rawRecord.issueSummary)).toContain('기성 확인 서류');
  });

  it('전체 현장이면 12행과 월별 요약 12개월을 보내고, 현장별 월별 기록은 보내지 않는다', () => {
    const p = payloadOf();
    expect(p.rawRecords).toHaveLength(12);
    expect(p.siteHistory).toBeUndefined();
    expect(p.computed.monthlySummary).toHaveLength(12);
    expect(p.computed.overall).toMatchObject({ progressRate: 67.2, plannedProgress: 73.2, actualProgress: 71.2, progressGap: -2, monthlyEarned: 28878.7 });
    expect(p.computed.monthlySummary[0].monthlyEarned).toBeNull();
  });

  it('선택 월 이후의 자료는 보내지 않는다(범위 밖 월 제외)', () => {
    const p = payloadOf({ month: '2026-03' });
    expect(p.computed.monthlySummary).toHaveLength(6);
    expect(p.rawRecords.every((r) => r.month === '2026-03')).toBe(true);
    expect(JSON.stringify(p)).not.toContain('2026-09');
  });

  it('지역·유형 필터가 그대로 반영된다', () => {
    const p = payloadOf({ region: '인천', type: '공동주택' });
    expect(p.rawRecords.map((r) => r.siteId)).toEqual(['A', 'G']);
    expect(p.scope).toMatchObject({ region: '인천', projectType: '공동주택', site: '전체' });
  });

  it('범위에 현장이 없으면 null', () => {
    expect(buildPayload(rows, f({ region: '인천', type: '생산시설' }), index)).toBeNull();
  });
});

describe('모델 출력 읽기', () => {
  const p = payloadOf({ site: 'D' });

  it('전달하지 않은 현장·월·필드 이름은 걷어낸다', () => {
    const r = parseModelText(
      JSON.stringify({ answer: '설명', sites: ['D', 'Z'], months: ['2026-09', '2030-01'], fields: ['issueSummary', 'secretField'] }),
      p,
    );
    expect(r).toEqual({ answer: '설명', sites: ['D'], months: ['2026-09'], fields: ['issueSummary'] });
  });

  it('코드 블록으로 감싸 와도 읽는다', () => {
    expect(parseModelText('```json\n{"answer":"가나다","sites":[],"months":[],"fields":[]}\n```', p).answer).toBe('가나다');
  });

  it('JSON이 아니면 글자 그대로를 답변으로 쓰고 근거 항목은 비워 둔다', () => {
    expect(parseModelText('그냥 글자', p)).toEqual({ answer: '그냥 글자', sites: [], months: [], fields: [] });
  });
});

describe('/api/ask 서버 코드', () => {
  const KEY = 'TESTKEY-abc123-SECRET';
  const call = (body: unknown) =>
    handleAsk(new Request('http://localhost/api/ask', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const ok = (answerObj: object) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answerObj) }] } }] }), { status: 200 });
  const req = (question = 'D가 늦어진 원인과 대응은?', payload: AiPayload = payloadOf({ site: 'D' })) => ({ question, payload });

  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', KEY);
    vi.stubEnv('AI_MOCK', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('성공: 지정 모델을 호출하고 키는 주소가 아니라 헤더로만 보낸다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ answer: '기록대로 설명', sites: ['D'], months: ['2026-09'], fields: ['issueSummary', 'actionPlan'] }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call(req());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, mock: false, answer: '기록대로 설명', sites: ['D'], fields: ['issueSummary', 'actionPlan'] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(MODEL);
    expect(String(url)).not.toContain(KEY);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    const sent = JSON.parse(init.body as string);
    expect(sent.systemInstruction.parts[0].text).toContain('원인 확정');
    expect(sent.contents[0].parts[0].text).toContain('"issueSummary"');
    expect(JSON.stringify(json)).not.toContain(KEY);
  });

  it('키가 없으면 no_key(503)이고 AI를 부르지 않는다', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await call(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, code: 'no_key' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'quota'],
    [403, 'bad_key'],
    [401, 'bad_key'],
    [500, 'failed'],
    [503, 'failed'],
  ])('AI 서버가 %i를 돌려주면 %s로 안내하고, 상류 응답 내용(키 포함)은 내보내지 않는다', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: `echo ${KEY}` } }), { status })));
    const res = await call(req());
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ ok: false, code });
    expect(text).not.toContain(KEY);
  });

  it('400 + API 키 오류 문구는 bad_key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"message":"API key not valid","status":"INVALID_ARGUMENT"}}', { status: 400 })));
    expect((await (await call(req())).json()).code).toBe('bad_key');
  });

  it(`${TIMEOUT_MS / 1000}초 안에 응답이 없으면 timeout(504)`, async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
      ),
    );
    const pending = call(req());
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 10);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(await res.json()).toMatchObject({ ok: false, code: 'timeout' });
  });

  it('연결이 끊기면 network 오류, 키는 나오지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`getaddrinfo ${KEY}`)));
    const res = await call(req());
    const text = await res.text();
    expect(JSON.parse(text).code).toBe('network');
    expect(text).not.toContain(KEY);
  });

  it('빈 답변은 failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 })));
    expect((await (await call(req())).json()).code).toBe('failed');
  });

  it('질문이 비었거나 너무 길거나 자료가 없으면 400', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await call(req(''))).status).toBe(400);
    expect((await call(req('가'.repeat(MAX_QUESTION + 1)))).status).toBe(400);
    expect((await call({ question: '질문', payload: null })).status).toBe(400);
    expect((await call('깨진 json')).status).toBe(400);
  });

  it('모의 응답(AI_MOCK=1): 키 없이도 동작하고 mock:true, 외부 호출 없음', async () => {
    vi.stubEnv('AI_MOCK', '1');
    vi.stubEnv('GEMINI_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const json = await (await call(req())).json();
    expect(json).toMatchObject({ ok: true, mock: true });
    expect(json.answer).toContain('[모의 응답]');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('모의 응답: 실제 준공일·미수금 질문은 "자료에 없다"고 답하고 계약상 준공일을 구분한다', async () => {
    vi.stubEnv('AI_MOCK', '1');
    const json = await (await call(req('실제 준공일·미수금은?'))).json();
    expect(json.answer).toContain('자료에 없어 알 수 없습니다');
    expect(json.answer).toContain('계약상 준공일');
    expect(json.fields).toEqual(['contractEndDate']);
  });
});
