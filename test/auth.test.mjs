import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './harness/load-code-gs.mjs';

// 해시를 직접 만들기 위해 서버 함수를 빌려 쓴다.
function rowWithPw({
  email = 'hong@etri.re.kr', name = '홍길동', pickA = true, pickB = false,
  pw = '1234', status = 'active', failCount = 0, lockedUntil = '',
} = {}) {
  const s = loadServer();
  const salt = 'fixed-salt';
  const hash = s.fn.hashPw_(salt, pw);
  return [email, name, pickA, pickB, hash, salt,
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'self',
          status, failCount, lockedUntil];
}

test('처음 보는 이메일은 mode=new 이고 아직 저장하지 않는다', () => {
  const s = loadServer();
  const res = s.call({ action: 'auth', email: 'NEWBIE', name: '홍 길동', pw: '9999' });
  assert.equal(res.ok, true);
  assert.equal(res.data.mode, 'new');
  assert.equal(res.data.email, 'newbie@etri.re.kr', '정규화된 이메일을 돌려줘야 확인 화면에 띄울 수 있다');
  assert.equal(res.data.name, '홍길동');
  assert.deepEqual(res.data.picks, { A: false, B: false });
  assert.equal(s.rows().length, 0, 'auth 단계에서 행을 만들면 안 된다');
});

test('이메일·이름·비번이 모두 맞으면 mode=existing 과 기존 선택을 준다', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  const res = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234' });
  assert.equal(res.ok, true);
  assert.equal(res.data.mode, 'existing');
  assert.deepEqual(res.data.picks, { A: true, B: false });
});

test('대문자로 입력해도 같은 행에 들어간다', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  const res = s.call({ action: 'auth', email: 'HONG', name: '홍길동', pw: '1234' });
  assert.equal(res.data.mode, 'existing');
});

test('이메일은 맞고 이름이 다르면 NAME_MISMATCH', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  const res = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길순', pw: '1234' });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'NAME_MISMATCH');
});

test('비밀번호가 틀리면 WRONG_PW 와 남은 횟수', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  const res = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '0000' });
  assert.equal(res.error, 'WRONG_PW');
  assert.equal(res.remaining, 4);
  assert.equal(s.rows()[0][10], 1, 'failCount 가 올라야 한다');
});

test('5회 틀리면 잠기고 잠금 중에는 카운터가 더 오르지 않는다', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  for (let i = 0; i < 5; i += 1) s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '0000' });

  assert.equal(s.rows()[0][10], 5);
  assert.equal(s.rows()[0][11], '2026-08-12T09:10:00.000Z', '10분 뒤로 잠금');

  const res = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '0000' });
  assert.equal(res.error, 'LOCKED');
  assert.equal(s.rows()[0][10], 5, '잠금 중엔 카운터를 올리지 않는다');
});

test('잠금 중에는 올바른 비밀번호도 거부한다', () => {
  const s = loadServer({ responses: [rowWithPw({ failCount: 5, lockedUntil: '2026-08-12T09:05:00.000Z' })] });
  const res = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234' });
  assert.equal(res.error, 'LOCKED');
});

test('잠금이 풀리면 카운터가 0으로 돌아가고 정상 판정한다', () => {
  const s = loadServer({ responses: [rowWithPw({ failCount: 5, lockedUntil: '2026-08-12T09:05:00.000Z' })] });
  s.setNow('2026-08-12T09:06:00.000Z');
  const res = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234' });
  assert.equal(res.ok, true);
  assert.equal(res.data.mode, 'existing');
  assert.equal(s.rows()[0][10], 0);
  assert.equal(s.rows()[0][11], '');
});

test('성공하면 failCount 가 0으로 초기화된다', () => {
  const s = loadServer({ responses: [rowWithPw({ failCount: 3 })] });
  s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234' });
  assert.equal(s.rows()[0][10], 0);
});

test('관리자 대리 입력 행(비번 없음)은 mode=claim 이고 비번을 묻지 않는다', () => {
  const s = loadServer({
    responses: [['hong@etri.re.kr', '홍길동', true, true, '', '',
                 '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'admin', 'active', 0, '']],
  });
  const res = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '5555' });
  assert.equal(res.ok, true);
  assert.equal(res.data.mode, 'claim');
  assert.deepEqual(res.data.picks, { A: true, B: true }, '관리자가 넣어준 선택을 보여준다');
  assert.equal(s.rows()[0][4], '', 'auth 만으로 비번을 설정하면 안 된다 — save 에서 한다');
});

test('잠금이 풀린 뒤 또 틀리면 카운터가 0에서 다시 1로 시작한다', () => {
  // 잠금 해제 직후의 첫 요청이 '틀린 비밀번호'인 경로. checkLock_ 이 카운터를 0으로
  // 되돌려 쓰고, 곧바로 registerFailure_ 가 1로 올려 다시 쓴다 — 한 요청에서 두 번 쓴다.
  // 여기가 어긋나면 잠금이 풀린 사람이 5회가 아니라 1회 만에 다시 잠기거나,
  // 반대로 영영 안 잠긴다.
  const s = loadServer({
    responses: [rowWithPw({ failCount: 5, lockedUntil: '2026-08-12T09:05:00.000Z' })],
  });
  s.setNow('2026-08-12T09:06:00.000Z');

  const res = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '0000' });
  assert.equal(res.error, 'WRONG_PW');
  assert.equal(res.remaining, 4, '해제 후 첫 실패이므로 4회가 남아야 한다');
  assert.equal(s.rows()[0][10], 1, 'failCount 는 5가 아니라 1이어야 한다');
  assert.equal(s.rows()[0][11], '', 'lockedUntil 은 비워진 채여야 한다');
});

test('삭제된 행은 없는 것으로 보아 mode=new', () => {
  const s = loadServer({ responses: [rowWithPw({ status: 'deleted' })] });
  const res = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234' });
  assert.equal(res.data.mode, 'new');
});

test('입력 형식 오류는 시트를 건드리기 전에 걸러낸다', () => {
  const s = loadServer();
  assert.equal(s.call({ action: 'auth', email: '가나다', name: '홍길동', pw: '1234' }).error, 'BAD_EMAIL');
  assert.equal(s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '  ', pw: '1234' }).error, 'BAD_NAME');
  assert.equal(s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '12' }).error, 'BAD_PW');
  assert.equal(s.rows().length, 0);
});

test('오류 응답에 pwHash 나 salt 가 새지 않는다', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  const res = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '0000' });
  const json = JSON.stringify(res);
  assert.equal(json.includes('fixed-salt'), false);
  assert.equal(/pwHash/.test(json), false);
});

test('auth 도 락을 못 잡으면 BUSY — failCount 를 쓰기 때문이다', () => {
  const s = loadServer({ responses: [rowWithPw()], lockFails: true });
  const res = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '0000' });
  assert.equal(res.error, 'BUSY');
  assert.equal(s.rows()[0][10], 0, 'failCount 가 오르면 안 된다');
});
