'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildIndex, type RowIndex } from './calc';
import { ERROR_TITLES, type AskErrorCode, type AskResponse } from './ask-types';
import { defaultFilter, normalizeFilter } from './filter';
import { buildPayload, MAX_QUESTION, type MonthlySummaryItem, type SiteComputed } from './prompt';
import type { Filter, Row } from './types';

export interface AskBasis {
  /** 질문한 시점의 기준 월과 범위 */
  month: string;
  scope: string;
  sites: string[];
  months: string[];
  fields: string[];
  /** 답변에 쓴 현장의 근거 숫자(프로그램이 계산한 값) */
  numbers: SiteComputed[];
  overall: MonthlySummaryItem | null;
}

export type AskItem =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'ai'; text: string; mock: boolean; basis: AskBasis }
  | { id: number; role: 'error'; code: AskErrorCode; title: string; text: string };

interface Store {
  /** 가져온 자료. 아직 없으면 null (처음 열었을 때) */
  rows: Row[] | null;
  index: RowIndex;
  filter: Filter;
  /** 지역·유형 변경으로 현장이 전체로 돌아갔을 때 안내 문구 */
  notice: string | null;
  /** 점검 순위에서 눌러 비교표로 이동할 때 강조·펼침할 현장 */
  focusSite: string | null;
  setFocusSite: (id: string | null) => void;
  setFilter: (patch: Partial<Filter>) => void;
  /** 검사를 통과한 자료로 기존 자료를 전체 교체한다(누적하지 않음) */
  applyRows: (rows: Row[]) => void;
  /** AI 질의: 대화 내용, 답변 대기 여부 */
  askItems: AskItem[];
  asking: boolean;
  ask: (question: string) => Promise<void>;
  clearAsk: () => void;
}

const Ctx = createContext<Store | null>(null);
const EMPTY: Filter = { month: '', region: '', type: '', site: '' };

export const scopeLabel = (f: Filter) =>
  `${f.month} · ${f.region || '전체 지역'} · ${f.type || '전체 유형'} · ${f.site ? `현장 ${f.site}` : '전체 현장'}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilterState] = useState<Filter>(EMPTY);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusSite, setFocusSite] = useState<string | null>(null);
  const [askItems, setAskItems] = useState<AskItem[]>([]);
  const [asking, setAsking] = useState(false);
  /** 범위가 바뀌면 올라가는 번호. 이전 번호로 보낸 요청의 늦은 응답은 버린다 */
  const gen = useRef(0);
  const seq = useRef(0);

  const resetAsk = useCallback(() => {
    gen.current += 1;
    setAskItems([]);
    setAsking(false);
  }, []);

  const setFilter = useCallback(
    (patch: Partial<Filter>) => {
      if (!rows) return;
      const next = normalizeFilter(rows, { ...filter, ...patch });
      if (JSON.stringify(next.filter) !== JSON.stringify(filter)) resetAsk();
      setFilterState(next.filter);
      setNotice(next.siteReset ? '선택했던 현장이 고른 지역·유형에 없어서 현장을 "전체"로 바꿨습니다.' : null);
    },
    [rows, filter, resetAsk],
  );

  const applyRows = useCallback(
    (next: Row[]) => {
      setRows(next);
      setFilterState(defaultFilter(next));
      setNotice(null);
      setFocusSite(null);
      resetAsk();
    },
    [resetAsk],
  );

  const index = useMemo(() => buildIndex(rows ?? []), [rows]);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!rows || question === '' || asking) return;
      const myGen = gen.current;
      const id = () => ++seq.current;
      const fail = (code: AskErrorCode, text: string) =>
        setAskItems((prev) => [...prev, { id: id(), role: 'error', code, title: ERROR_TITLES[code], text }]);

      setAskItems((prev) => [...prev, { id: id(), role: 'user', text: question }]);
      const payload = buildPayload(rows, filter, index);
      if (!payload) {
        fail('bad_request', '고른 범위에 현장이 없어 질문할 수 없습니다. 필터를 바꿔 보세요.');
        return;
      }
      if (question.length > MAX_QUESTION) {
        fail('bad_request', `질문은 ${MAX_QUESTION}자 이하로 입력하세요.`);
        return;
      }

      setAsking(true);
      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question, payload }),
        });
        let data: AskResponse | null = null;
        try {
          data = (await res.json()) as AskResponse;
        } catch {
          data = null;
        }
        if (myGen !== gen.current) return; // 기다리는 동안 범위가 바뀜: 새 범위에 표시하지 않는다
        if (data && data.ok) {
          const basis: AskBasis = {
            month: payload.scope.month,
            scope: scopeLabel(filter),
            sites: data.sites,
            months: data.months,
            fields: data.fields,
            numbers: payload.computed.selectedMonth.filter((c) => data.sites.includes(c.siteId)),
            overall: payload.computed.overall,
          };
          setAskItems((prev) => [...prev, { id: id(), role: 'ai', text: data.answer, mock: data.mock, basis }]);
        } else if (data && !data.ok) {
          fail(data.code, data.message);
        } else {
          fail('failed', 'AI 서버에서 읽을 수 없는 응답이 왔습니다.');
        }
      } catch {
        if (myGen !== gen.current) return;
        fail('network', '서버에 연결하지 못했습니다.');
      } finally {
        if (myGen === gen.current) setAsking(false);
      }
    },
    [rows, filter, index, asking],
  );

  const value = useMemo(
    () => ({
      rows, index, filter, notice, focusSite, setFocusSite, setFilter, applyRows,
      askItems, asking, ask, clearAsk: resetAsk,
    }),
    [rows, index, filter, notice, focusSite, setFilter, applyRows, askItems, asking, ask, resetAsk],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider 안에서만 쓸 수 있습니다.');
  return v;
}
