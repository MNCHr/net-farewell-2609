import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './harness/load-code-gs.mjs';

const ADMIN = 'admin-secret';
function fresh() {
  const seed = loadServer();
  const salt = 'admin-salt';
  return loadServer({
    properties: { ADMIN_SALT: salt, ADMIN_PW_HASH: seed.fn.hashPw_(salt, ADMIN) },
  });
}

test('시나리오 1-2: 신규 가입 → 제출 → 재로그인 → 수정', () => {
  const s = fresh();

  assert.equal(s.call({ action: 'auth', empNo: '2664', name: '김민준', pw: '1111' }).data.mode, 'new');
  assert.equal(s.rows().length, 0);

  s.call({ action: 'save', empNo: '2664', name: '김민준', pw: '1111', pickA: true, pickB: true });
  assert.equal(s.rows().length, 1);

  const back = s.call({ action: 'auth', empNo: '01111', name: '김민준', pw: '1111' });
  assert.equal(back.data.mode, 'existing');
  assert.deepEqual(back.data.picks, { A: true, B: true });

  s.call({ action: 'save', empNo: '01111', name: '김민준', pw: '1111', pickA: true, pickB: false });
  assert.equal(s.rows().length, 1, '행이 늘면 안 된다');
  assert.equal(s.rows()[0][3], false);
});

test('시나리오 3: 앞의 0을 뺀 사번은 같은 행으로 모인다', () => {
  const s = fresh();
  s.call({ action: 'save', empNo: '02222', name: '이서연', pw: '2222', pickA: true, pickB: false });
  s.call({ action: 'save', empNo: '1629', name: '이서연', pw: '2222', pickA: false, pickB: true });
  assert.equal(s.rows().length, 1);
  assert.equal(s.call({ action: 'adminData', adminPw: ADMIN }).data.stats.total, 1);
});

test('시나리오 4-5: 이름 불일치 · 5회 실패 잠금 · 10분 뒤 해제', () => {
  const s = fresh();
  s.call({ action: 'save', empNo: '33333', name: '박도유', pw: '3333', pickA: true, pickB: true });

  assert.equal(s.call({ action: 'auth', empNo: '33333', name: '박도윤', pw: '3333' }).error, 'NAME_MISMATCH');

  for (let i = 0; i < 5; i += 1) s.call({ action: 'auth', empNo: '33333', name: '박도유', pw: '0000' });
  assert.equal(s.call({ action: 'auth', empNo: '33333', name: '박도유', pw: '3333' }).error, 'LOCKED');

  s.setNow('2026-08-12T09:11:00.000Z');
  assert.equal(s.call({ action: 'auth', empNo: '33333', name: '박도유', pw: '3333' }).data.mode, 'existing');
});

test('시나리오 6: 아무것도 체크하지 않은 제출이 none 에 잡힌다', () => {
  const s = fresh();
  s.call({ action: 'save', empNo: '44444', name: '최수아', pw: '4444', pickA: false, pickB: false });
  const st = s.call({ action: 'adminData', adminPw: ADMIN }).data.stats;
  assert.equal(st.total, 1);
  assert.equal(st.none, 1);
  assert.equal(st.a, 0);
  assert.equal(st.b, 0);
});

test('시나리오 7 · 12: 관리자 비밀번호 없이는 어떤 데이터도 안 나온다', () => {
  const s = fresh();
  s.call({ action: 'save', empNo: '55555', name: '오지훈', pw: '5555', pickA: true, pickB: false });

  for (const req of [
    { action: 'adminData' },
    { action: 'adminData', adminPw: '' },
    { action: 'adminData', adminPw: '틀림' },
    { action: 'adminDelete', adminPw: '틀림', empNo: '55555' },
    { action: 'adminUpsert', adminPw: '틀림', empNo: '55555', name: '오지훈' },
    { action: 'adminResetPw', adminPw: '틀림', empNo: '55555' },
  ]) {
    const res = s.call(req);
    assert.equal(res.ok, false, JSON.stringify(req));
    assert.equal(/오지훈|55555/.test(JSON.stringify(res)), false, '데이터가 새면 안 된다');
  }
  assert.equal(s.rows()[0][9], 'active', '아무것도 바뀌지 않았어야 한다');
});

test('시나리오 8: 관리자 대리 입력 → 본인이 이어받아 수정', () => {
  const s = fresh();
  s.call({ action: 'adminUpsert', adminPw: ADMIN, empNo: '3576', name: '한도경', pickA: true, pickB: false });
  assert.equal(s.rows()[0][0], '06666');
  assert.equal(s.rows()[0][4], '', '비번은 비어 있다');

  const claim = s.call({ action: 'auth', empNo: '06666', name: '한도경', pw: '6666' });
  assert.equal(claim.data.mode, 'claim');
  assert.deepEqual(claim.data.picks, { A: true, B: false });

  s.call({ action: 'save', empNo: '06666', name: '한도경', pw: '6666', pickA: true, pickB: true });
  assert.equal(s.call({ action: 'auth', empNo: '06666', name: '한도경', pw: '6666' }).data.mode, 'existing');
  assert.equal(s.rows().length, 1);
});

test('시나리오 9: 비번 초기화 → 새 비번으로 재진입', () => {
  const s = fresh();
  s.call({ action: 'save', empNo: '07777', name: '서지민', pw: '7777', pickA: true, pickB: true });
  s.call({ action: 'adminResetPw', adminPw: ADMIN, empNo: '07777' });

  assert.equal(s.call({ action: 'auth', empNo: '07777', name: '서지민', pw: '7777' }).data.mode, 'claim',
    '옛 비번도 새 비번도 아무거나 통한다 — 미설정 상태이므로');
  s.call({ action: 'save', empNo: '07777', name: '서지민', pw: '8888', pickA: true, pickB: true });
  assert.equal(s.call({ action: 'auth', empNo: '07777', name: '서지민', pw: '8888' }).data.mode, 'existing');
  assert.equal(s.call({ action: 'auth', empNo: '07777', name: '서지민', pw: '7777' }).error, 'WRONG_PW',
    '새 비번을 정한 뒤에는 초기화 전 비번이 되살아나면 안 된다');
});

test('시나리오 10-11: 삭제는 집계에서만 빠지고, 재가입하면 되살아난다', () => {
  const s = fresh();
  s.call({ action: 'save', empNo: '08888', name: '배윤아', pw: '9999', pickA: true, pickB: true });
  s.call({ action: 'adminDelete', adminPw: ADMIN, empNo: '08888' });

  assert.equal(s.call({ action: 'adminData', adminPw: ADMIN }).data.stats.total, 0);
  assert.equal(s.rows().length, 1, '시트에는 남아 있다');
  assert.equal(s.rows()[0][9], 'deleted');

  s.call({ action: 'save', empNo: '08888', name: '배윤아', pw: '1010', pickA: false, pickB: true });
  assert.equal(s.rows().length, 1, '새 행이 생기면 안 된다');
  assert.equal(s.call({ action: 'adminData', adminPw: ADMIN }).data.stats.total, 1);

  // 여기서 멈추면 안 된다. 위의 두 줄은 되살리기가 비밀번호를 버려도 그대로 통과한다
  // (행 수도 1, 집계도 1이므로). 실제로 그 버그가 있었고, 본인이 다음 로그인에서
  // WRONG_PW 로 막히다 5회 잠금까지 갔다. 되살아난 뒤 '새로 낸 비밀번호로 실제로
  // 들어가지는지'를 물어야만 그 버그가 잡힌다.
  assert.equal(
    s.call({ action: 'auth', empNo: '08888', name: '배윤아', pw: '1010' }).data.mode,
    'existing', '재가입할 때 낸 비밀번호로 들어갈 수 있어야 한다');
  assert.equal(
    s.call({ action: 'auth', empNo: '08888', name: '배윤아', pw: '9999' }).error,
    'WRONG_PW', '삭제 전 비밀번호는 더 이상 통하지 않아야 한다');
});

test('시나리오 13: 어떤 응답에도 pwHash·salt 가 없다', () => {
  const s = fresh();
  s.call({ action: 'save', empNo: '01111', name: '김민준', pw: '1111', pickA: true, pickB: false });

  const responses = [
    s.call({ action: 'ping' }),
    s.call({ action: 'auth', empNo: '01111', name: '김민준', pw: '1111' }),
    s.call({ action: 'auth', empNo: '01111', name: '김민준', pw: '0000' }),
    s.call({ action: 'save', empNo: '01111', name: '김민준', pw: '1111', pickA: false, pickB: true }),
    s.call({ action: 'adminData', adminPw: ADMIN }),
  ];
  for (const r of responses) {
    assert.equal(/pwHash|"salt"|admin-salt/.test(JSON.stringify(r)), false, JSON.stringify(r).slice(0, 120));
  }
});

test('108명이 제출해도 집계 합계가 어긋나지 않는다', () => {
  const s = fresh();
  for (let i = 1; i <= 108; i += 1) {
    const empNo = String(i).padStart(5, '0');
    s.call({
      action: 'save', empNo, name: '사람' + i, pw: '1234',
      pickA: i % 3 !== 0, pickB: i % 4 !== 0,
    });
  }
  const st = s.call({ action: 'adminData', adminPw: ADMIN }).data.stats;
  assert.equal(st.total, 108);
  assert.equal(st.both + st.onlyA + st.onlyB + st.none, st.total);
  assert.equal(st.a, st.both + st.onlyA);
  assert.equal(st.b, st.both + st.onlyB);
  assert.equal(s.rows().length, 108, '중복 행이 없어야 한다');
});
