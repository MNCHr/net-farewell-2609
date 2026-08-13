/**
 * 관리자 화면의 표를 탭 구분 텍스트로 만든다.
 *
 * DOM 을 건드리지 않는 순수 함수다 — admin.js 는 최상위에서 document 를 만지므로
 * Node 에서 import 할 수 없다. 표를 만드는 로직만 여기 떼어두면 브라우저 없이 검증되고,
 * 세 개의 복사 버튼이 같은 코드 경로를 쓴다는 것도 구조로 보장된다.
 */

/** filterKey: null 이면 전체, 'A'/'B' 면 그 퇴직자를 선택한 행만. */
function pick(row, key) {
  return key === 'A' ? !!row.pickA : !!row.pickB;
}

function filterRows(rows, filterKey) {
  if (!filterKey) return rows.slice();
  return rows.filter((r) => pick(r, filterKey));
}

export function countFor(rows, filterKey) {
  return filterRows(rows, filterKey).length;
}

export function buildTable(rows, retirees, filterKey) {
  const header = ['이메일', '이름', retirees[0].label, retirees[1].label, '최종수정'];
  const body = filterRows(rows, filterKey).map((r) => [
    r.email,
    r.name,
    r.pickA ? 'O' : '',
    r.pickB ? 'O' : '',
    (r.updatedAt || '').slice(0, 10),
  ]);
  return [header, ...body].map((cols) => cols.join('\t')).join('\n');
}
