'use client';

import { FilterBar } from '@/components/FilterBar';
import { Kpis } from '@/components/Kpis';
import { MonthlyBars } from '@/components/MonthlyBars';
import { NoData } from '@/components/NoData';
import { Ranking } from '@/components/Ranking';
import { TrendChart } from '@/components/TrendChart';
import { useStore } from '@/lib/store';

export default function Home() {
  const { rows } = useStore();
  if (!rows) return <NoData />;
  return (
    <>
      <h1>현황 요약</h1>
      <FilterBar />
      <Kpis />
      <Ranking />
      <div className="grid2">
        <TrendChart />
        <MonthlyBars />
      </div>
    </>
  );
}
