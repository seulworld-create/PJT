'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExportButton } from './ExportButton';

const ITEMS = [
  { href: '/', label: '현황 요약' },
  { href: '/compare', label: '현장별 비교표' },
  { href: '/import', label: '자료 가져오기' },
  { href: '/ask', label: 'AI에게 묻기' },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="nav">
      <div className="nav-title">
        <strong>현장별 공정·기성 관리 시스템</strong>
        <span>교육용 가상 자료</span>
      </div>
      <nav aria-label="페이지 메뉴">
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href} className={path === it.href ? 'active' : ''} aria-current={path === it.href ? 'page' : undefined}>
            {it.label}
          </Link>
        ))}
      </nav>
      <ExportButton />
    </header>
  );
}
