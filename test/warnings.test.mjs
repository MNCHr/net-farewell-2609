import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warningMessage } from '../assets/warnings.js';

test('같은 이름 여러 이메일 — 건수가 실제 개수를 따라간다', () => {
  // 예전에 '두 건' 이 문자열에 박혀 있어서 세 건일 때도 "두 건" 이라고 떴다.
  // 실제 사용 중에 발견된 버그라 개수별로 못 박아둔다.
  const two = warningMessage({
    type: 'SAME_NAME_DIFF_EMAIL', name: '김기태',
    emails: ['a@etri.re.kr', 'b@etri.re.kr'],
  });
  assert.match(two, /2건/);
  assert.equal(/두 건/.test(two), false, '개수를 문자열에 박아두면 안 된다');

  const three = warningMessage({
    type: 'SAME_NAME_DIFF_EMAIL', name: '김기태',
    emails: ['a@etri.re.kr', 'b@etri.re.kr', 'c@etri.re.kr'],
  });
  assert.match(three, /3건/);

  const five = warningMessage({
    type: 'SAME_NAME_DIFF_EMAIL', name: '김기태',
    emails: ['a@etri.re.kr', 'b@etri.re.kr', 'c@etri.re.kr', 'd@etri.re.kr', 'e@etri.re.kr'],
  });
  assert.match(five, /5건/);
});

test('같은 이름 경고에 이름과 이메일이 전부 들어간다', () => {
  const emails = ['dwdqwe@etri.re.kr', 'ijeqiwjei@etri.re.kr', 'awdqweqw2@etri.re.kr'];
  const msg = warningMessage({ type: 'SAME_NAME_DIFF_EMAIL', name: '김기태', emails });
  assert.match(msg, /김기태/);
  for (const e of emails) {
    assert.ok(msg.includes(e), `${e} 가 문구에 있어야 담당자가 어느 행을 고칠지 안다`);
  }
});

test('같은 이메일 여러 이름 — 가짓수가 실제 개수를 따라간다', () => {
  const two = warningMessage({
    type: 'SAME_EMAIL_DIFF_NAME', email: 'hong@etri.re.kr', names: ['홍길동', '홍길순'],
  });
  assert.match(two, /2가지/);
  assert.match(two, /hong@etri\.re\.kr/);
  assert.match(two, /홍길동/);
  assert.match(two, /홍길순/);

  const three = warningMessage({
    type: 'SAME_EMAIL_DIFF_NAME', email: 'hong@etri.re.kr', names: ['홍길동', '홍길순', '홍길산'],
  });
  assert.match(three, /3가지/);
});

test('알 수 없는 경고 유형은 던진다', () => {
  // 조용히 빈 문장을 내놓으면 담당자가 경고가 있다는 사실만 보고 내용을 못 읽는다.
  assert.throws(
    () => warningMessage({ type: 'SOMETHING_NEW', foo: 1 }),
    /알 수 없는 경고 유형/);
});
