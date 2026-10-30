import Link from 'next/link';

/** 처음 열었을 때(자료 없음) */
export function NoData() {
  return (
    <section className="state state-empty" role="status">
      <h2>자료 없음</h2>
      <p>아직 가져온 자료가 없습니다. 자료 가져오기에서 파일을 불러오세요.</p>
      <Link className="btn" href="/import">
        자료 가져오기로 이동
      </Link>
    </section>
  );
}
