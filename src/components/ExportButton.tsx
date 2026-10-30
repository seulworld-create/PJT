'use client';

import { useEffect, useState } from 'react';
import { buildCsv } from '@/lib/csv';
import { scopeRows } from '@/lib/filter';
import { useStore } from '@/lib/store';

export function ExportButton() {
  const { rows, index, filter } = useStore();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  function onClick() {
    const scope = rows ? scopeRows(rows, filter) : [];
    if (scope.length === 0) {
      setMsg('내보낼 자료가 없습니다. 자료를 가져오고 범위를 확인하세요.');
      return;
    }
    const csv = buildCsv(scope, index);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const parts = [filter.month, filter.region, filter.type, filter.site].filter(Boolean);
    const a = document.createElement('a');
    a.href = url;
    a.download = `현장공정기성_${parts.join('_')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg(`CSV를 내려받았습니다: ${filter.month} 범위 ${scope.length}행 (원본 15열 + 계산 4열)`);
  }

  return (
    <div className="export">
      <button type="button" className="btn ghost" onClick={onClick} data-testid="export-csv">
        CSV 내보내기
      </button>
      {msg && (
        <span className="export-msg" role="status" data-testid="export-msg">
          {msg}
        </span>
      )}
    </div>
  );
}
