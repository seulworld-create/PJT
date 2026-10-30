'use client';

import { useRouter } from 'next/navigation';
import { fmtPct, fmtPp, rankSites, summarize } from '@/lib/calc';
import { scopeRows } from '@/lib/filter';
import { useStore } from '@/lib/store';
import { StatusBadge } from './StatusBadge';

export function Ranking() {
  const { rows, index, filter, setFocusSite } = useStore();
  const router = useRouter();
  if (!rows) return null;

  const scope = scopeRows(rows, filter);
  const summary = summarize(scope, index);
  if (!summary) return null; // 범위에 현장이 없으면 큰 숫자 쪽의 "자료 없음"이 안내한다

  const ranked = rankSites(scope, index).filter((x) => x.m.status === '점검');

  function open(siteId: string) {
    setFocusSite(siteId);
    router.push('/compare');
  }

  return (
    <section className="card" aria-label="점검 현장 순위">
      <div className="rank-head">
        <h2>점검 현장 순위 (공정차이가 작은 순)</h2>
        <p className="strip" data-testid="status-counts">
          <span className="badge ok">● 정상 {summary.counts.정상}곳</span>
          <span className="badge warn">▲ 주의 {summary.counts.주의}곳</span>
          <span className="badge bad">■ 점검 {summary.counts.점검}곳</span>
        </p>
      </div>

      {ranked.length === 0 ? (
        <div className="state state-empty slim" role="status" data-testid="no-inspection">
          <h3>점검 대상 없음</h3>
          <p>고른 범위에는 공정차이 -5pp 이하인 점검 현장이 없습니다. (주의 {summary.counts.주의}곳)</p>
        </div>
      ) : (
        <ol className="rank-list">
          {ranked.map(({ row, m }, i) => (
            <li key={row.siteId}>
              <button type="button" className="rank-row" onClick={() => open(row.siteId)} data-testid={`rank-${row.siteId}`}>
                <span className="rank-no">{i + 1}</span>
                <span className="rank-name">
                  <strong>
                    {row.siteId} 현장 <span className="muted">{row.siteName}</span>
                  </strong>
                  <small>
                    {row.region} · {row.projectType} · 공사기간 {row.startDate} ~ {row.contractEndDate}
                  </small>
                </span>
                <span className="rank-num"><small>계획공정</small>{fmtPct(row.plannedProgress)}</span>
                <span className="rank-num"><small>실제공정</small><b className="accent">{fmtPct(row.actualProgress)}</b></span>
                <span className="rank-num neg"><small>공정차이</small><b>{fmtPp(m.gap)}</b></span>
                <span className="rank-num"><small>기성률</small>{fmtPct(m.rate)}</span>
                <span className="rank-go">비교표에서 보기 →</span>
                <StatusBadge status={m.status} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
