'use client';

import { monthsOf } from '@/lib/calc';
import { regionOptions, siteOptions, typeOptions } from '@/lib/filter';
import { useStore } from '@/lib/store';

export function FilterBar() {
  const { rows, filter, setFilter, notice } = useStore();
  if (!rows) return null;
  const sites = siteOptions(rows, filter);
  return (
    <section className="filters" aria-label="필터">
      <label>
        <span>기준월</span>
        <select value={filter.month} onChange={(e) => setFilter({ month: e.target.value })}>
          {monthsOf(rows).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>지역</span>
        <select value={filter.region} onChange={(e) => setFilter({ region: e.target.value })}>
          <option value="">전체 지역</option>
          {regionOptions(rows).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>공사 유형</span>
        <select value={filter.type} onChange={(e) => setFilter({ type: e.target.value })}>
          <option value="">전체 유형</option>
          {typeOptions(rows).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>현장</span>
        <select value={filter.site} onChange={(e) => setFilter({ site: e.target.value })}>
          <option value="">전체 현장</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} {s.name}
            </option>
          ))}
        </select>
      </label>
      <p className="scope" aria-live="polite">
        현재 범위: {filter.month} · {filter.region || '전체 지역'} · {filter.type || '전체 유형'} ·{' '}
        {filter.site ? `현장 ${filter.site}` : '전체 현장'}
      </p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
