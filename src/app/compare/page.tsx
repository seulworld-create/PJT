'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { FilterBar } from '@/components/FilterBar';
import { NoData } from '@/components/NoData';
import { StatusBadge } from '@/components/StatusBadge';
import { fmtMoney, fmtMoneyInt, fmtPct, fmtPp, rankSites, summarize } from '@/lib/calc';
import { scopeRows } from '@/lib/filter';
import { useStore } from '@/lib/store';

const NA = '계산 불가';
const COLS = 12;

export default function ComparePage() {
  const { rows, index, filter, focusSite } = useStore();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const focusRef = useRef<HTMLTableRowElement | null>(null);
  const handled = useRef<string | null>(null);

  // 점검 순위에서 눌러 들어오면 그 현장 줄을 펼치고 화면에 보이게 한다
  useEffect(() => {
    if (!focusSite || handled.current === focusSite) return;
    handled.current = focusSite;
    setOpen((prev) => new Set(prev).add(focusSite));
    const t = setTimeout(() => focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    return () => clearTimeout(t);
  }, [focusSite]);

  if (!rows) return <NoData />;

  const scope = scopeRows(rows, filter);
  const ranked = rankSites(scope, index);
  const total = summarize(scope, index);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const focusMissing = focusSite !== null && !ranked.some((x) => x.row.siteId === focusSite);

  return (
    <>
      <h1>현장별 비교표</h1>
      <FilterBar />
      {focusMissing && (
        <p className="notice-inline" role="status">현재 범위에 없는 현장입니다({focusSite}). 필터를 확인하세요.</p>
      )}

      {!total ? (
        <section className="state state-empty" role="status">
          <h2>자료 없음</h2>
          <p>고른 범위에 해당하는 현장이 없습니다. 필터를 바꿔 보세요.</p>
        </section>
      ) : (
        <section className="card" aria-label="현장별 비교표">
          <p className="muted small">행을 누르면 공사기간·기록된 상황·기록된 대응 계획이 펼쳐집니다. 정렬은 점검 우선순위(공정차이가 작은 순)입니다. 금액 단위는 백만원입니다.</p>
          <div className="table-wrap">
            <table className="compare" data-testid="compare-table">
              <thead>
                <tr>
                  <th>현장</th><th>지역</th><th>유형</th><th>당월 주요 공종</th>
                  <th className="num">계약금액</th><th className="num">누적기성액</th><th className="num">당월기성액</th>
                  <th className="num">기성률</th><th className="num">계획공정</th><th className="num">실제공정</th>
                  <th className="num">공정차이</th><th>상태</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ row, m }) => {
                  const isOpen = open.has(row.siteId);
                  const isFocus = focusSite === row.siteId;
                  return (
                    <Fragment key={row.siteId}>
                      <tr
                        ref={isFocus ? focusRef : undefined}
                        className={`site-row ${isOpen ? 'open' : ''} ${isFocus ? 'focus' : ''}`}
                        data-testid={`row-${row.siteId}`}
                      >
                        <td>
                          <button type="button" className="expander" aria-expanded={isOpen} onClick={() => toggle(row.siteId)}>
                            <span aria-hidden>{isOpen ? '▾' : '▸'}</span>{' '}
                            <strong>{row.siteId}</strong> {row.siteName}
                          </button>
                        </td>
                        <td>{row.region}</td>
                        <td>{row.projectType}</td>
                        <td>{row.currentWork}</td>
                        <td className="num">{fmtMoneyInt(row.contractAmount)}</td>
                        <td className="num">{fmtMoney(row.cumulativeEarned)}</td>
                        <td className="num" data-testid={`monthly-${row.siteId}`}>{m.monthly === null ? NA : fmtMoney(m.monthly)}</td>
                        <td className="num">{fmtPct(m.rate)}</td>
                        <td className="num">{fmtPct(row.plannedProgress)}</td>
                        <td className="num">{fmtPct(row.actualProgress)}</td>
                        <td className={`num ${m.gap < 0 ? 'neg' : 'pos'}`}>{fmtPp(m.gap)}</td>
                        <td><StatusBadge status={m.status} /></td>
                      </tr>
                      {isOpen && (
                        <tr className="detail-row" data-testid={`detail-${row.siteId}`}>
                          <td colSpan={COLS}>
                            <div className="detail">
                              <p>
                                <strong>공사기간</strong> {row.startDate} ~ {row.contractEndDate}{' '}
                                <span className="muted">(계약상 일정이며 실제 완료일·예측일이 아닙니다)</span>
                              </p>
                              <p><strong>특이사항 분류</strong> {row.issueCategory} <span className="muted">· 상태 판정과는 별개의 현장 기록 분류입니다</span></p>
                              <div className="detail-grid">
                                <div>
                                  <h4>기록된 상황 <small>({row.month})</small></h4>
                                  <p>{row.issueSummary || '기록 없음'}</p>
                                </div>
                                <div>
                                  <h4>기록된 대응 계획 <small>(예정 대응이며 완료·효과를 뜻하지 않음)</small></h4>
                                  <p>{row.actionPlan || '기록 없음'}</p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr data-testid="compare-total">
                  <td colSpan={4}><strong>합계 및 가중평균 (총 {total.siteCount}곳)</strong></td>
                  <td className="num">{fmtMoneyInt(total.contract)}</td>
                  <td className="num">{fmtMoney(total.earned)}</td>
                  <td className="num">{total.monthly === null ? NA : fmtMoney(total.monthly)}</td>
                  <td className="num">{fmtPct(total.rate)}</td>
                  <td className="num">{fmtPct(total.planned)}</td>
                  <td className="num">{fmtPct(total.actual)}</td>
                  <td className={`num ${total.gap < 0 ? 'neg' : 'pos'}`}>{fmtPp(total.gap)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="muted small">
            공정차이 = 실제공정률 − 계획공정률(pp). 상태: 0pp 이상 정상 / -5pp 초과 0pp 미만 주의 / -5pp 이하 점검. 당월기성액은 이번 달 누적기성액 − 바로 전월 누적기성액이며, 전월 자료가 없으면 "계산 불가"입니다.
          </p>
        </section>
      )}
    </>
  );
}
