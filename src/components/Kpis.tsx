'use client';

import { fmtMoney, fmtMoneyInt, fmtPct, fmtPp, summarize } from '@/lib/calc';
import { scopeRows } from '@/lib/filter';
import { useStore } from '@/lib/store';

const NA = '계산 불가';

export function Kpis() {
  const { rows, index, filter } = useStore();
  if (!rows) return null;
  const s = summarize(scopeRows(rows, filter), index);

  if (!s) {
    return (
      <section className="state state-empty" role="status">
        <h2>자료 없음</h2>
        <p>고른 범위에 해당하는 현장이 없어 숫자를 계산할 수 없습니다. 필터를 바꿔 보세요.</p>
      </section>
    );
  }

  const gapClass = s.gap < 0 ? 'neg' : 'pos';
  return (
    <section className="kpis" aria-label="큰 숫자">
      <article className="card">
        <h3>전체 기성률</h3>
        <p className="big" data-testid="kpi-rate">{fmtPct(s.rate)}</p>
        <dl>
          <div><dt>계약금액</dt><dd>{fmtMoneyInt(s.contract)} 백만원</dd></div>
          <div><dt>누적기성액</dt><dd>{fmtMoney(s.earned)} 백만원</dd></div>
          <div><dt>{filter.month} 당월기성액</dt><dd data-testid="kpi-monthly">{s.monthly === null ? NA : `${fmtMoney(s.monthly)} 백만원`}</dd></div>
        </dl>
      </article>
      <article className="card">
        <h3>계획 공정률</h3>
        <p className="big" data-testid="kpi-planned">{fmtPct(s.planned)}</p>
        <dl><div><dt>기준</dt><dd>월말 누적, 계약금액 가중평균</dd></div></dl>
      </article>
      <article className="card">
        <h3>실제 공정률</h3>
        <p className="big accent" data-testid="kpi-actual">{fmtPct(s.actual)}</p>
        <dl><div><dt>기준</dt><dd>월말 누적, 계약금액 가중평균</dd></div></dl>
      </article>
      <article className="card">
        <h3>공정차이</h3>
        <p className={`big ${gapClass}`} data-testid="kpi-gap">{fmtPp(s.gap)}</p>
        <dl><div><dt>계산</dt><dd>실제 − 계획 (현장 {s.siteCount}곳)</dd></div></dl>
      </article>
    </section>
  );
}
