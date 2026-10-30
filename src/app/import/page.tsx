'use client';

import { useRef, useState, type DragEvent } from 'react';
import { fmtMoney, fmtMoneyInt } from '@/lib/calc';
import { useStore } from '@/lib/store';
import { COLUMNS } from '@/lib/types';
import { formatIssue, validateFileText, type ValidationResult } from '@/lib/validate';

interface Pending {
  fileName: string;
  result: ValidationResult;
}

const MAX_SHOWN = 30;

export default function ImportPage() {
  const { rows, applyRows } = useStore();
  const [pending, setPending] = useState<Pending | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setDone(null);
    const text = await file.text();
    setPending({ fileName: file.name, result: validateFileText(file.name, text) });
    if (inputRef.current) inputRef.current.value = ''; // 같은 파일을 다시 골라도 동작하게
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    void pick(e.dataTransfer.files[0]);
  }

  function apply() {
    if (!pending?.result.ok) return;
    const n = pending.result.rows.length;
    applyRows(pending.result.rows);
    setDone(`${pending.fileName}: ${n}행으로 교체했습니다. 이전 자료는 이 자료로 완전히 바뀌었습니다(누적되지 않음).`);
    setPending(null);
  }

  const r = pending?.result;
  const hasErrors = !!r && r.errors.length > 0;

  return (
    <>
      <h1>자료 가져오기</h1>
      <section className="card intro">
        <h2>전체 공정·기성 자료 검증 및 교체</h2>
        <p>CSV 또는 JSON을 검사하고 미리 보여준 뒤 전체를 바꿉니다. 오류가 있거나 취소하면 지금 자료를 그대로 둡니다.</p>
        <p className="muted small">CSV에는 파일 정보가 없으므로 데이터 설명서의 단위(금액 백만원, 공정률 %)와 15개 열 기준을 따른다고 보고 검사합니다.</p>
        <p data-testid="current-data" className="current">
          현재 등록 자료: {rows ? <strong>{rows.length}행</strong> : <strong>없음</strong>}
        </p>
      </section>

      <section
        className={`card drop ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <p><strong>CSV 또는 JSON 파일을 여기에 끌어 놓으세요</strong></p>
        <label className="btn" htmlFor="file">내 컴퓨터에서 파일 선택</label>
        <input
          id="file"
          ref={inputRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </section>

      {done && (
        <section className="state state-ok" role="status" data-testid="import-done">
          <h2>가져오기 완료</h2>
          <p>{done}</p>
        </section>
      )}

      {pending && r && (
        <>
          {hasErrors ? (
            <section className="state state-error" role="alert" data-testid="import-error">
              <h2>가져오기 오류: {pending.fileName}</h2>
              <p>
                오류 {r.errors.length}건이 있어 반영하지 않았습니다.{' '}
                <strong>{rows ? `지금 자료(${rows.length}행)는 그대로 유지됩니다.` : '지금 자료는 그대로입니다(아직 가져온 자료 없음).'}</strong>
              </p>
              <ul>
                {r.errors.slice(0, MAX_SHOWN).map((e, i) => (
                  <li key={i}>{formatIssue(e)}</li>
                ))}
              </ul>
              {r.errors.length > MAX_SHOWN && <p className="muted">외 {r.errors.length - MAX_SHOWN}건</p>}
            </section>
          ) : (
            <section className="state state-ok" role="status" data-testid="import-ready">
              <h2>검사 통과: {pending.fileName}</h2>
              <p>{r.recordCount}행, 15개 열을 모두 확인했습니다. 아래 미리보기를 보고 "적용"을 누르면 지금 자료 전체가 이 자료로 바뀝니다.</p>
            </section>
          )}

          {r.warnings.length > 0 && (
            <section className="state state-warn" role="status">
              <h2>경고 {r.warnings.length}건</h2>
              <ul>{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </section>
          )}

          <section className="card">
            <h3>데이터 정합성 검사</h3>
            <div className="stats">
              <div><span>현재 등록 자료</span><strong>{rows ? `${rows.length}행` : '없음'}</strong></div>
              <div><span>검사한 새 파일</span><strong>{r.recordCount}행</strong></div>
              <div><span>필수 열 일치</span><strong>{COLUMNS.filter((c) => r.columnStatus[c] === 'ok').length} / {COLUMNS.length}</strong></div>
              <div><span>오류 · 경고</span><strong>{r.errors.length}건 · {r.warnings.length}건</strong></div>
            </div>
            <ul className="cols">
              {COLUMNS.map((c, i) => (
                <li key={c} className={r.columnStatus[c]}>
                  <span aria-hidden>{r.columnStatus[c] === 'ok' ? '✓' : '✗'}</span> {i + 1}. {c}
                  <span className="sr"> {r.columnStatus[c] === 'ok' ? '통과' : '오류'}</span>
                </li>
              ))}
            </ul>
          </section>

          {r.ok && (
            <section className="card">
              <h3>미리보기 (전체 {r.rows.length}행 중 상위 5행)</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>월</th><th>현장</th><th>현장명</th><th className="num">계약금액(백만원)</th>
                      <th className="num">계획공정(%)</th><th className="num">실제공정(%)</th>
                      <th className="num">누적기성액(백만원)</th><th>당월 주요 공종</th><th>특이사항 분류</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.slice(0, 5).map((x) => (
                      <tr key={`${x.month}${x.siteId}`}>
                        <td>{x.month}</td><td>{x.siteId}</td><td>{x.siteName}</td>
                        <td className="num">{fmtMoneyInt(x.contractAmount)}</td>
                        <td className="num">{x.plannedProgress.toFixed(1)}</td>
                        <td className="num">{x.actualProgress.toFixed(1)}</td>
                        <td className="num">{fmtMoney(x.cumulativeEarned)}</td>
                        <td>{x.currentWork}</td><td>{x.issueCategory}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="actions">
            <button type="button" className="btn ghost" onClick={() => setPending(null)}>
              {hasErrors ? '닫기 (지금 자료 유지)' : '취소 (지금 자료 유지)'}
            </button>
            <button type="button" className="btn" disabled={!r.ok} onClick={apply}>
              적용 ({r.ok ? `${r.rows.length}행으로 전체 교체` : '오류가 있어 적용할 수 없음'})
            </button>
          </section>
        </>
      )}
    </>
  );
}
