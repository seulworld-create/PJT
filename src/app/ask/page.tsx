'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { FilterBar } from '@/components/FilterBar';
import { NoData } from '@/components/NoData';
import { StatusBadge } from '@/components/StatusBadge';
import { fmtMoney, fmtPct, fmtPp } from '@/lib/calc';
import { scopeRows } from '@/lib/filter';
import { MAX_QUESTION } from '@/lib/prompt';
import { scopeLabel, useStore, type AskItem } from '@/lib/store';
import type { Status } from '@/lib/types';

const EXAMPLES = ['D가 늦어진 원인과 대응은?', 'I는 왜 점검 현장인가요?', '실제 준공일·미수금은?'];

function Basis({ item }: { item: Extract<AskItem, { role: 'ai' }> }) {
  const b = item.basis;
  return (
    <div className="basis" data-testid="ai-basis">
      <h4>답변 근거</h4>
      <dl>
        <div><dt>기준 월</dt><dd>{b.month}</dd></div>
        <div><dt>범위</dt><dd>{b.scope}</dd></div>
        <div><dt>근거 현장</dt><dd>{b.sites.length ? b.sites.join(', ') : '지정되지 않음'}</dd></div>
        {b.months.length > 0 && <div><dt>참고한 월</dt><dd>{b.months.join(', ')}</dd></div>}
        <div>
          <dt>참고한 기록 필드</dt>
          <dd>{b.fields.length ? b.fields.map((f) => <code key={f}>{f}</code>) : '지정되지 않음'}</dd>
        </div>
      </dl>
      {b.numbers.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>현장</th><th className="num">공정차이</th><th className="num">기성률</th><th className="num">당월기성액(백만원)</th><th>상태</th>
              </tr>
            </thead>
            <tbody>
              {b.numbers.map((n) => (
                <tr key={n.siteId}>
                  <td>{n.siteId}</td>
                  <td className="num">{fmtPp(n.progressGap)}</td>
                  <td className="num">{fmtPct(n.progressRate)}</td>
                  <td className="num">{n.monthlyEarned === null ? '계산 불가' : fmtMoney(n.monthlyEarned)}</td>
                  <td><StatusBadge status={n.status as Status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        b.overall && (
          <p className="small">
            범위 전체 {b.overall.month}: 기성률 {fmtPct(b.overall.progressRate)} · 계획 {fmtPct(b.overall.plannedProgress)} · 실제{' '}
            {fmtPct(b.overall.actualProgress)} · 공정차이 {fmtPp(b.overall.progressGap)}
          </p>
        )
      )}
      <p className="muted small">숫자는 프로그램이 계산한 값이며, AI는 이 숫자와 기록을 바탕으로 설명합니다.</p>
    </div>
  );
}

function Bubble({ item }: { item: AskItem }) {
  if (item.role === 'user') {
    return <div className="msg user" data-testid="msg-user">{item.text}</div>;
  }
  if (item.role === 'error') {
    return (
      <div className="msg state state-error" role="alert" data-testid="ai-error">
        <h3>{item.title}</h3>
        <p>{item.text}</p>
        <p><strong>대시보드와 CSV는 계속 쓸 수 있습니다.</strong></p>
      </div>
    );
  }
  return (
    <div className="msg ai" data-testid="ai-answer">
      {item.mock && <span className="badge warn">모의 응답</span>}
      <p className="answer">{item.text}</p>
      <Basis item={item} />
    </div>
  );
}

export default function AskPage() {
  const { rows, filter, askItems, asking, ask, clearAsk } = useStore();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [askItems.length, asking]);

  if (!rows) return <NoData />;

  const empty = scopeRows(rows, filter).length === 0;

  function send(q: string) {
    if (empty || asking || q.trim() === '') return;
    setText('');
    void ask(q);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(text);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(text);
    }
  }

  return (
    <>
      <h1>AI에게 묻기</h1>
      <FilterBar />
      <section className="card ask-info">
        <p>
          <strong>지금 범위:</strong> <span data-testid="ask-scope">{scopeLabel(filter)}</span>
        </p>
        <p className="muted small">
          숫자 계산은 프로그램이 하고, AI는 기록된 상황·대응 계획을 근거로 설명합니다. 자료에 없는 내용(실제 준공일, 미수금 등)은 "알 수 없음"으로 답합니다. 범위를 바꾸면 이전 답변은 지워집니다.
        </p>
      </section>

      {empty ? (
        <section className="state state-empty" role="status">
          <h2>자료 없음</h2>
          <p>고른 범위에 해당하는 현장이 없어 질문할 수 없습니다. 필터를 바꿔 보세요.</p>
        </section>
      ) : (
        <>
          <section className="examples" aria-label="예시 질문">
            <span className="muted small">예시 질문</span>
            {EXAMPLES.map((q) => (
              <button key={q} type="button" className="chip" disabled={asking} onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </section>

          <section className="thread" aria-live="polite" data-testid="thread">
            {askItems.length === 0 && !asking && <p className="muted">질문을 입력하거나 예시 질문을 눌러 보세요.</p>}
            {askItems.map((it) => (
              <Bubble key={it.id} item={it} />
            ))}
            {asking && (
              <div className="msg state state-wait" role="status" data-testid="ai-waiting">
                <p>AI 답변을 기다리는 중입니다… (최대 30초)</p>
                <p className="muted small">기다리는 동안에도 다른 화면과 CSV 내보내기는 쓸 수 있습니다.</p>
              </div>
            )}
            <div ref={endRef} />
          </section>

          <form className="ask-form" onSubmit={onSubmit}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              maxLength={MAX_QUESTION}
              rows={2}
              placeholder="공정·기성 기록에 관해 질문하세요 (Enter로 전송, Shift+Enter 줄바꿈)"
              aria-label="질문 입력"
              disabled={asking}
            />
            <div className="ask-actions">
              <button type="button" className="btn ghost" onClick={clearAsk} disabled={askItems.length === 0 && !asking}>
                새 대화
              </button>
              <button type="submit" className="btn" disabled={asking || text.trim() === ''}>
                질문 전송
              </button>
            </div>
          </form>
        </>
      )}
    </>
  );
}
