/**
 * 관리자 화면의 ⚠️ 경고 문구를 만든다.
 *
 * DOM 을 건드리지 않는 순수 함수다 — admin.js 는 최상위에서 document 를 만지므로
 * Node 에서 import 할 수 없다. 문구 조립만 여기 떼어두면 브라우저 없이 검증된다.
 *
 * 이 문구는 담당자가 오타를 잡아내는 단서다. 자유 입력이라 오타가 실제로 생기고,
 * 잘못 세거나 잘못 읽히면 멀쩡한 사람의 응답을 지우거나 진짜 중복을 놓친다.
 * 예전에 '두 건' 이 문자열에 박혀 있어서 세 건일 때도 "두 건" 이라고 뜬 적이 있다.
 */

/** 서버의 computeWarnings_ 가 내는 두 종류를 사람이 읽을 문장으로 바꾼다. */
export function warningMessage(w) {
  if (w.type === 'SAME_NAME_DIFF_EMAIL') {
    return `‘${w.name}’ 님이 ${w.emails.length}건 있습니다 — `
         + `${w.emails.join(' / ')}. 이메일 오타일 수 있습니다.`;
  }
  if (w.type === 'SAME_EMAIL_DIFF_NAME') {
    return `이메일 ${w.email} 에 이름이 ${w.names.length}가지로 기록돼 있습니다 — `
         + `${w.names.join(' / ')}.`;
  }
  // 조용히 빈 문장을 내놓으면 담당자가 경고가 있다는 사실만 보고 내용을 못 읽는다.
  throw new Error('알 수 없는 경고 유형: ' + w.type);
}
