// 브라우저 구현과 서버 구현을 모두 이 표로 검증한다.
// 규칙이 바뀌면 여기부터 고친다.

export const EMPNO_CASES = [
  { input: '01234', expected: '01234', why: '그대로' },
  { input: '1234',  expected: '01234', why: '앞의 0을 빼고 입력 — 실제 명단 대부분이 0으로 시작한다' },
  { input: '123',   expected: '00123', why: '0 두 개 생략' },
  { input: '1',     expected: '00001', why: '한 자리' },
  { input: '1 2 3 4', expected: '01234', why: '띄어쓰기' },
  { input: '1-234', expected: '01234', why: '하이픈' },
  { input: ' 01111 ', expected: '01111', why: '앞뒤 공백' },
  { input: '１２３', expected: '00123', why: '전각 숫자' },
  { input: '99999', expected: '99999', why: '0으로 시작하지 않는 사번도 있다' },
  { input: '88888', expected: '88888', why: '연수생 사번' },
  { input: '123456', expected: null,   why: '6자리는 오류' },
  { input: '',      expected: null,    why: '빈 값' },
  { input: '   ',   expected: null,    why: '공백뿐' },
  { input: 'abcde', expected: null,    why: '숫자가 하나도 없음' },
  { input: null,    expected: null,    why: 'null' },
  { input: undefined, expected: null,  why: 'undefined' },
];

export const NAME_CASES = [
  { input: '홍길동',    expected: '홍길동', why: '그대로' },
  { input: '홍 길동',   expected: '홍길동', why: '가운데 공백' },
  { input: '  홍길동 ', expected: '홍길동', why: '앞뒤 공백' },
  { input: '홍　길동',  expected: '홍길동', why: '전각 공백' },
  { input: '카림 유수프', expected: '카림유수프', why: '외국인 이름 — 띄어쓰기가 사람마다 갈린다' },
  { input: '응우옌 티린', expected: '응우옌티린', why: '외국인 이름' },
  { input: 'Kim Kitae', expected: 'KimKitae', why: '영문 표기' },
  { input: '홍길동\t',  expected: '홍길동', why: '탭' },
  { input: '홍\u200b길동', expected: '홍길동', why: '제로폭 공백 U+200B' },
  { input: '홍\u200c길동', expected: '홍길동', why: '제로폭 비접합자 U+200C' },
  { input: '홍\u200d길동', expected: '홍길동', why: '제로폭 접합자 U+200D' },
  { input: '홍\ufeff길동', expected: '홍길동', why: '바이트 순서 표식(BOM) U+FEFF' },
  { input: '',          expected: null,    why: '빈 값' },
  { input: '   ',       expected: null,    why: '공백뿐' },
  { input: '가'.repeat(21), expected: null, why: '20자 초과' },
  { input: '가'.repeat(20), expected: '가'.repeat(20), why: '경계값 20자는 통과' },
  { input: null,        expected: null,    why: 'null' },
];

export const PW_CASES = [
  { input: '1234',  expected: '1234', why: '그대로' },
  { input: '0000',  expected: '0000', why: '앞자리 0 유지 — 채우지 않고 그대로 둔다' },
  { input: ' 1234 ', expected: '1234', why: '앞뒤 공백' },
  { input: '１２３４', expected: '1234', why: '전각 숫자' },
  { input: '123',   expected: null,   why: '3자리' },
  { input: '12345', expected: null,   why: '5자리' },
  { input: 'abcd',  expected: null,   why: '숫자 아님' },
  { input: '12a4',  expected: null,   why: '일부만 숫자' },
  { input: '',      expected: null,   why: '빈 값' },
  { input: null,    expected: null,   why: 'null' },
];
