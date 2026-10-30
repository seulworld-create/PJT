'use client';

import { fmtMoney, fmtPct, trendOf } from '@/lib/calc';
import { useStore } from '@/lib/store';

const W = 640;
const H = 300;
const PAD = { l: 16, r: 16, t: 28, b: 34 };

export function MonthlyBars() {
  const { rows, index, filter } = useStore();
  if (!rows) return null;
  const points = trendOf(rows, filter, index);

  if (points.every((p) => p.summary === null)) {
    return (
      <section className="card chart" aria-label="월별 기성">
        <h3>월별 당월기성액</h3>
        <p className="muted" role="status">자료 없음: 고른 범위에 해당하는 현장이 없습니다.</p>
      </section>
    );
  }

  const n = points.length;
  const max = Math.max(1, ...points.map((p) => p.summary?.monthly ?? 0));
  const slot = (W - PAD.l - PAD.r) / n;
  const bw = Math.min(40, slot * 0.6);
  const base = H - PAD.b;
  const h = (v: number) => (v / max) * (base - PAD.t);
  const lastIdx = n - 1;

  // 선택 월과 그 직전 두 달의 누적기성액(누적과 당월을 구별해 표시)
  const tail = points.slice(-3).filter((p) => p.summary);

  return (
    <section className="card chart" aria-label="월별 기성">
      <h3>월별 당월기성액 (막대) <span className="muted">백만원</span></h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`월별 당월기성액 막대, ${n}개월`}>
        <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} className="grid" />
        {points.map((p, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          const m = p.summary?.monthly;
          return (
            <g key={p.month}>
              {m === null || m === undefined ? (
                <text x={cx} y={base - 8} textAnchor="middle" className="axis na">{p.summary ? '계산 불가' : '자료 없음'}</text>
              ) : (
                <>
                  <rect x={cx - bw / 2} y={base - h(m)} width={bw} height={Math.max(h(m), m === 0 ? 1 : 0)} className={i === lastIdx ? 'bar bar-last' : 'bar'}>
                    <title>{`${p.month} 당월기성액 ${fmtMoney(m)}백만원`}</title>
                  </rect>
                  <text x={cx} y={base - h(m) - 6} textAnchor="middle" className="axis">{fmtMoney(m)}</text>
                </>
              )}
              <text x={cx} y={H - 10} textAnchor="middle" className="axis">{p.month.slice(5)}월</text>
            </g>
          );
        })}
      </svg>
      <div className="cum-row" data-testid="cum-row">
        {tail.map((p) => (
          <div key={p.month} className={p.month === filter.month ? 'cum cum-last' : 'cum'}>
            <span>{p.month} 누적기성액</span>
            <strong>{fmtMoney(p.summary!.earned)}</strong>
            <em>백만원 ({fmtPct(p.summary!.rate)})</em>
          </div>
        ))}
      </div>
      <p className="muted small">막대는 그 달의 당월기성액(이번 달 누적 − 전월 누적)이고, 아래 숫자는 월말까지의 누적기성액입니다. 첫 달은 전월 자료가 없어 "계산 불가"입니다.</p>
    </section>
  );
}
