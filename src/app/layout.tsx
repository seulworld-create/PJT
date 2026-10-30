import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Nav } from '@/components/Nav';
import { StoreProvider } from '@/lib/store';
import './globals.css';

export const metadata: Metadata = {
  title: '현장별 공정·기성 대시보드',
  description: '교육용 가상 자료로 현장별 공정·기성 현황을 보는 대시보드',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <StoreProvider>
          <Nav />
          <main className="page">{children}</main>
          <footer className="foot">교육용 가상 자료입니다. 실제 회사의 계약·현장·청구 자료가 아닙니다.</footer>
        </StoreProvider>
      </body>
    </html>
  );
}
