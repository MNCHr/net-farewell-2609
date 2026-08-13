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
  { input: '99999', expected: '99999', why: '0으로 시작하지 않는 사번도 있을 수 있다' },
  { input: '88888', expected: '88888', why: '연수생 같은 별도 대역의 사번도 있을 수 있다' },
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
  { input: '홍\u3000길동',  expected: '홍길동', why: '전각 공백' },
  { input: '카림 유수프', expected: '카림유수프', why: '외국인 이름(가상) — 띄어쓰기가 사람마다 갈린다' },
  { input: '응우옌 티린', expected: '응우옌티린', why: '외국인 이름(가상)' },
  { input: 'Oh Jihun', expected: 'OhJihun', why: '영문 표기' },
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

// 이메일 신원. 아이디(@ 앞)만 신원으로 쓰고, 저장할 때 도메인을 붙인다.
// 도메인을 신원에 넣으면 같은 사람이 'abc' 와 'abc@etri.re.kr' 로 갈라진다 —
// 사번의 앞자리 0과 같은 함정이다.
export const EMAIL_CASES = [
  { input: 'abc', expected: 'abc@etri.re.kr', why: '아이디만 입력 — 기본 사용법' },
  { input: 'ABC', expected: 'abc@etri.re.kr', why: '대문자로 쳐도 같은 사람' },
  { input: 'AbC', expected: 'abc@etri.re.kr', why: '섞어 쳐도 같은 사람' },
  { input: 'abc@etri.re.kr', expected: 'abc@etri.re.kr', why: '전체 이메일 붙여넣기 — 가장 흔할 입력 편차' },
  { input: 'ABC@ETRI.RE.KR', expected: 'abc@etri.re.kr', why: '전체 이메일을 대문자로' },
  { input: 'abc@etri.kr', expected: 'abc@etri.re.kr', why: '도메인이 달라도 아이디가 같으면 같은 사람' },
  { input: 'abc@', expected: 'abc@etri.re.kr', why: '@ 까지만 치고 만 경우 — 아이디가 유효하면 통과' },
  { input: ' abc ', expected: 'abc@etri.re.kr', why: '앞뒤 공백' },
  { input: 'hong.gildong', expected: 'hong.gildong@etri.re.kr', why: '점' },
  { input: 'hgd_2', expected: 'hgd_2@etri.re.kr', why: '밑줄' },
  { input: 'gildong-h', expected: 'gildong-h@etri.re.kr', why: '하이픈' },
  { input: 'a+b', expected: 'a+b@etri.re.kr', why: '플러스' },
  { input: 'a', expected: 'a@etri.re.kr', why: '한 글자' },
  { input: 'a'.repeat(64), expected: 'a'.repeat(64) + '@etri.re.kr', why: '경계값 64자는 통과' },
  { input: 'a'.repeat(65), expected: null, why: '64자 초과' },
  { input: '@etri.re.kr', expected: null, why: '@ 앞이 비었다' },
  { input: '', expected: null, why: '빈 값' },
  { input: '   ', expected: null, why: '공백뿐' },
  { input: '가나다', expected: null, why: '한글은 아이디에 못 쓴다' },
  { input: 'a b', expected: null, why: '가운데 공백 — 두 사람을 붙여 친 것일 수 있어 통과시키면 안 된다' },
  { input: 'a!b', expected: null, why: '허용하지 않는 기호' },
  { input: 'a/b', expected: null, why: '허용하지 않는 기호' },

  // 아래는 붙여넣기 사고와 눈에 안 보이는 문자를 못 박아두는 케이스들이다.
  { input: 'abc@etri.re.kr@etri.re.kr', expected: 'abc@etri.re.kr',
    why: '전체 이메일을 두 번 붙여넣음 — 첫 @ 앞만 취해 흡수한다' },
  { input: 'a\tb', expected: null, why: '가운데 탭 — 공백과 같이 잘못 친 것으로 본다' },
  { input: 'a\u3000b', expected: null, why: '가운데 전각 공백 (한글 IME 에서 흔하다)' },
  { input: 'a\u200bb', expected: null, why: '가운데 제로폭 공백 — 다른 시스템에서 복사할 때 딸려온다' },
  { input: '\u3000abc\u3000', expected: 'abc@etri.re.kr', why: '앞뒤 전각 공백은 다듬는다' },

  // 아래 둘은 통과가 맞다. 실제 이메일 규격은 점으로 시작/끝나는 아이디를 금지하지만,
  // 여기서는 관대한 쪽을 택했다 — 규칙이 빡빡해서 멀쩡한 사람이 못 들어오는 것이
  // 오타 아이디로 빈 행 하나 생기는 것보다 나쁘다. 오타는 화면 힌트에 그대로 보이고
  // 관리자가 지울 수 있다.
  { input: '.abc', expected: '.abc@etri.re.kr', why: '점으로 시작 — 관대하게 통과시킨다' },
  { input: 'hong..gildong', expected: 'hong..gildong@etri.re.kr', why: '점 두 개 — 관대하게 통과시킨다' },
  { input: null, expected: null, why: 'null' },
  { input: undefined, expected: null, why: 'undefined' },
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
