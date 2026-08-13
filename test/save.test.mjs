import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './harness/load-code-gs.mjs';

function withPw(over = {}) {
  const s = loadServer();
  const salt = 'fixed-salt';
  return ['hong@etri.re.kr', '홍길동', false, false, s.fn.hashPw_(salt, '1234'), salt,
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'self',
          over.status || 'active', 0, ''];
}

test('신규 저장은 행을 만들고 비밀번호를 해시로 넣는다', () => {
  const s = loadServer();
  const res = s.call({ action: 'save', email: 'HONG', name: '홍 길동', pw: '9999', pickA: true, pickB: false });

  assert.equal(res.ok, true);
  assert.deepEqual(res.data.picks, { A: true, B: false });

  const row = s.rows()[0];
  assert.equal(row[0], 'hong@etri.re.kr');
  assert.equal(row[1], '홍길동');
  assert.equal(row[2], true);
  assert.equal(row[3], false);
  assert.notEqual(row[4], '', 'pwHash 가 있어야 한다');
  assert.notEqual(row[4], '9999', '원문을 저장하면 안 된다');
  assert.equal(row[8], 'self');
  assert.equal(row[9], 'active');
});

test('둘 다 체크하지 않은 제출도 정상 저장된다', () => {
  const s = loadServer();
  const res = s.call({ action: 'save', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234', pickA: false, pickB: false });
  assert.equal(res.ok, true);
  assert.equal(s.rows().length, 1, '불참도 하나의 응답이다');
  assert.equal(s.rows()[0][2], false);
  assert.equal(s.rows()[0][3], false);
});

test('재저장은 행을 늘리지 않고 갱신하며 createdAt 을 보존한다', () => {
  const s = loadServer({ responses: [withPw()] });
  s.setNow('2026-08-13T01:02:03.000Z');
  const res = s.call({ action: 'save', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234', pickA: true, pickB: true });

  assert.equal(res.ok, true);
  assert.equal(s.rows().length, 1);
  assert.equal(s.rows()[0][6], '2026-08-01T00:00:00.000Z', 'createdAt 은 그대로');
  assert.equal(s.rows()[0][7], '2026-08-13T01:02:03.000Z', 'updatedAt 은 갱신');
});

test('대문자로 저장해도 같은 행을 고친다', () => {
  const s = loadServer({ responses: [withPw()] });
  s.call({ action: 'save', email: 'HONG', name: '홍길동', pw: '1234', pickA: true, pickB: false });
  assert.equal(s.rows().length, 1, '중복 행이 생기면 안 된다');
});

test('관리자 대리 입력 행에 본인이 처음 저장하면 비밀번호가 설정된다', () => {
  const s = loadServer({
    responses: [['hong@etri.re.kr', '홍길동', true, false, '', '',
                 '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'admin', 'active', 0, '']],
  });
  const res = s.call({ action: 'save', email: 'hong@etri.re.kr', name: '홍길동', pw: '7777', pickA: false, pickB: true });

  assert.equal(res.ok, true);
  assert.notEqual(s.rows()[0][4], '', 'pwHash 설정');
  assert.notEqual(s.rows()[0][5], '', 'salt 설정');
  assert.equal(s.rows()[0][8], 'self', '이제 본인이 관리한다');

  // 설정된 비밀번호로 다시 들어갈 수 있어야 한다
  assert.equal(s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '7777' }).data.mode, 'existing');
});

test('삭제된 이메일로 다시 제출하면 새 행이 아니라 기존 행이 되살아난다', () => {
  const s = loadServer({ responses: [withPw({ status: 'deleted' })] });
  const res = s.call({ action: 'save', email: 'hong@etri.re.kr', name: '홍길동', pw: '5555', pickA: true, pickB: false });

  assert.equal(res.ok, true);
  assert.equal(s.rows().length, 1, '같은 이메일의 active 행이 둘이 되면 안 된다');
  assert.equal(s.rows()[0][9], 'active');
});

test('되살아난 행은 삭제 전 비밀번호가 아니라 새로 제출한 비밀번호로 인증된다', () => {
  const s = loadServer({ responses: [withPw({ status: 'deleted' })] });
  const res = s.call({ action: 'save', email: 'hong@etri.re.kr', name: '홍길동', pw: '5555', pickA: true, pickB: false });
  assert.equal(res.ok, true);

  // 여전히 행은 하나이고 active 다.
  assert.equal(s.rows().length, 1, '같은 이메일의 active 행이 둘이 되면 안 된다');
  assert.equal(s.rows()[0][9], 'active');

  // 새로 제출한 비밀번호로 로그인이 되어야 한다.
  const authNew = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '5555' });
  assert.equal(authNew.ok, true, '새로 제출한 비밀번호가 통해야 한다');
  assert.equal(authNew.data.mode, 'existing', '새로 제출한 비밀번호가 통해야 한다');

  // 삭제 전 비밀번호는 더 이상 통하면 안 된다.
  const authOld = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234' });
  assert.equal(authOld.error, 'WRONG_PW', '삭제 전 비밀번호는 죽어야 한다');

  // log 에는 되살림이 revive 로 남아야 한다 (update/claim 이 아니라).
  const logs = s.logRows();
  assert.equal(logs.length, 1);
  assert.equal(logs[0][1], 'revive');
});

test('비밀번호가 틀리면 저장하지 않는다', () => {
  const s = loadServer({ responses: [withPw()] });
  const res = s.call({ action: 'save', email: 'hong@etri.re.kr', name: '홍길동', pw: '0000', pickA: true, pickB: true });
  assert.equal(res.error, 'WRONG_PW');
  assert.equal(s.rows()[0][2], false, '선택이 바뀌면 안 된다');
});

test('락을 못 잡으면 BUSY 이고 아무것도 쓰지 않는다', () => {
  const s = loadServer({ lockFails: true });
  const res = s.call({ action: 'save', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234', pickA: true, pickB: false });
  assert.equal(res.error, 'BUSY');
  assert.equal(s.rows().length, 0);
});

test('pick 값이 문자열로 와도 불리언으로 저장한다', () => {
  const s = loadServer();
  s.call({ action: 'save', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234', pickA: 'true', pickB: 1 });
  assert.equal(s.rows()[0][2], true);
  assert.equal(s.rows()[0][3], true);
});

test('저장하면 log 에 기록이 남는다', () => {
  const s = loadServer();
  s.call({ action: 'save', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234', pickA: true, pickB: false });
  const logs = s.logRows();
  assert.equal(logs.length, 1);
  assert.equal(logs[0][1], 'create');
  assert.equal(logs[0][2], 'hong@etri.re.kr');
  assert.equal(logs[0][3], 'self');
  assert.equal(/1234/.test(logs[0][4]), false, '로그에 비밀번호가 새면 안 된다');
});

test('응답에 pwHash 나 salt 가 없다', () => {
  const s = loadServer();
  const res = s.call({ action: 'save', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234', pickA: true, pickB: false });
  const json = JSON.stringify(res);
  assert.equal(/pwHash|salt/.test(json), false);
});
