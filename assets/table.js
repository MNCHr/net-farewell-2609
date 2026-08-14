/**
 * 관리자 화면의 표를 탭 구분 텍스트로 만든다.
 *
 * DOM 을 건드리지 않는 순수 함수다 — admin.js 는 최상위에서 document 를 만지므로
 * Node 에서 import 할 수 없다. 표를 만드는 로직만 여기 떼어두면 브라우저 없이 검증되고,
 * 세 개의 복사 버튼이 같은 코드 경로를 쓴다는 것도 구조로 보장된다.
 */

/**
 * filterKey: null 이면 전체, 그 외에는 아래 FILTERS 에 등록된 키만 받는다.
 *
 * - A / B: 그 퇴직자를 선택한 행 (메일용 — 둘 다 고른 사람도 포함된다)
 * - BOTH / ONLY_A / ONLY_B: 정산용 — 세 무리는 서로 겹치지 않는다.
 *   A 의 명단은 BOTH 와 ONLY_A 를 섞어 담고 있어 정산(받을 금액이 다름)에는
 *   못 쓴다. 그래서 배타적인 세 필터를 따로 둔다.
 *
 * 키 목록을 여기 한 군데에 못 박아둔다. `else` 로 뭉뚱그리면 나중에 퇴직자가
 * 셋이 되는 날 이름 모를 필터가 조용히 다른 명단을 내놓는다 — 명단을 메일
 * 수신자·정산 근거로 쓰는 화면이라 조용히 틀리는 것이 제일 나쁘다.
 */
const FILTERS = {
  A:      (r) => !!r.pickA,
  B:      (r) => !!r.pickB,
  BOTH:   (r) => !!r.pickA && !!r.pickB,
  ONLY_A: (r) => !!r.pickA && !r.pickB,
  ONLY_B: (r) => !r.pickA && !!r.pickB,
};

function filterRows(rows, filterKey) {
  if (!filterKey) return rows.slice();
  const fn = FILTERS[filterKey];
  if (!fn) throw new Error('알 수 없는 퇴직자 키: ' + filterKey);
  return rows.filter(fn);
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
