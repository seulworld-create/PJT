'use client';

import { fmtPct, fmtPp, trendOf } from '@/lib/calc';
import { useStore } from '@/lib/store';

const W = 640;
const H = 300;
const PAD = { l: 44, r: 16, t: 16, b: 34 };

export function TrendChart() {
  const { rows, index, filter } = useStore();
  if (!rows) return null;
  const points = trendOf(rows, filter, index);
  const last = points[points.length - 1];

  if (points.every((p) => p.summary === null)) {
    return (
      <section className="card chart" aria-label="공정률 추이">
        <h3>누적 공정률 추이 (계획 vs 실제)</h3>
        <p className="muted" role="status">자료 없음: 고른 범위에 해당하는 현장이 없습니다.</p>
      </section>
    );
  }

  const n = points.length;
  const x = (i: number) => PAD.l + (n === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + ((100 - v) / 100) * (H - PAD.t - PAD.b);

  // 자료가 없는 달에서는 선을 끊는다
  const path = (pick: 'planned' | 'actual') => {
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      if (!p.summary) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.summary[pick]).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  const label = (m: string) => (m.endsWith('-01') || m === points[0].month ? `'${m.slice(2, 4)}.${m.slice(5)}` : m.slice(5));

  return (
    <section className="card chart" aria-label="공정률 추이">
      <h3>{points[0].month}부터 {filter.month}까지 누적 공정률 추이 (계획 vs 실제)</h3>
      <div className="legend">
        <span><i className="swatch dashed" />계획</span>
        <span><i className="swatch solid" />실제</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`계획·실제 누적 공정률 추이, ${points.length}개월`}>
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="axis">{v}%</text>
          </g>
        ))}
        <path d={path('planned')} className="line planned" />
        <path d={path('actual')} className="line actual" />
        {points.map((p, i) =>
          p.summary ? (
            <g key={p.month}>
              <circle cx={x(i)} cy={y(p.summary.planned)} r={i === n - 1 ? 4 : 2.5} className="dot planned" />
              <circle cx={x(i)} cy={y(p.summary.actual)} r={i === n - 1 ? 4.5 : 3} className="dot actual">
                <title>{`${p.month} 계획 ${fmtPct(p.summary.planned)} / 실제 ${fmtPct(p.summary.actual)} / 차이 ${fmtPp(p.summary.gap)}`}</title>
              </circle>
            </g>
          ) : null,
        )}
        {points.map((p, i) => (
          <text key={p.month} x={x(i)} y={H - 10} textAnchor="middle" className="axis">{label(p.month)}</text>
        ))}
      </svg>
      <p className="chart-foot" data-testid="trend-foot">
        {last.summary ? (
          <>
            <strong>{last.month} 시점</strong> 계획 {fmtPct(last.summary.planned)} · 실제 {fmtPct(last.summary.actual)} ·{' '}
            <span className={last.summary.gap < 0 ? 'neg' : 'pos'}>차이 {fmtPp(last.summary.gap)}</span>
          </>
        ) : (
          <>{last.month}: 자료 없음</>
        )}
      </p>
    </section>
  );
}
