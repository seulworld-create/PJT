import type { Status } from '@/lib/types';

/** 색만으로 구분하지 않고 "정상·주의·점검" 글자를 함께 쓴다 */
export function StatusBadge({ status }: { status: Status }) {
  const cls = status === '정상' ? 'ok' : status === '주의' ? 'warn' : 'bad';
  const mark = status === '정상' ? '●' : status === '주의' ? '▲' : '■';
  return (
    <span className={`badge ${cls}`}>
      <span aria-hidden>{mark}</span> {status}
    </span>
  );
}
