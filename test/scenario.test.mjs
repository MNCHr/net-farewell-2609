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

  assert.equal(s.call({ action: 'auth', empNo: '1111', name: '김민준', pw: '1111' }).data.mode, 'new');
  assert.equal(s.rows().length, 0);

  s.call({ action: 'save', empNo: '1111', name: '김민준', pw: '1111', pickA: true, pickB: true });
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
  s.call({ action: 'save', empNo: '2222', name: '이서연', pw: '2222', pickA: false, pickB: true });
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
  s.call({ action: 'adminUpsert', adminPw: ADMIN, empNo: '6666', name: '한도경', pickA: true, pickB: false });
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
    // 세 관리자 조작 응답도 훑는다 — adminData 만 훑고 나머지 셋을 빼놓으면
    // 이 응답들이 새로 pwHash/salt 를 실어 보내도 이 테스트가 못 잡는다.
    s.call({ action: 'adminUpsert', adminPw: ADMIN, empNo: '01111', name: '김민준', pickA: true, pickB: true }),
    s.call({ action: 'adminResetPw', adminPw: ADMIN, empNo: '01111' }),
    s.call({ action: 'adminDelete', adminPw: ADMIN, empNo: '01111' }),
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

  // 위 네 합계식은 버킷을 전부 고르게 잘못 세는 computeStats_ 라도 그대로 통과한다
  // (예: 전부 both 로, 또는 전부 반씩 나눠 세도 식은 성립한다). i%3/i%4 패턴은 값이
  // 고정돼 있으므로 버킷 하나하나를 직접 검증한다.
  //
  // pickA = i%3!==0 → 1..108 중 3의 배수(=false)는 108/3=36개, pickA=true 는 72개 → a=72
  // pickB = i%4!==0 → 1..108 중 4의 배수(=false)는 108/4=27개, pickB=true 는 81개 → b=81
  // none  = pickA=false ∧ pickB=false → 3과 4 모두의 배수, 즉 12의 배수 → 108/12=9개 → none=9
  // onlyB = pickA=false ∧ pickB=true  → 3의 배수(36개) 중 12의 배수(9개)를 뺀 나머지 → 27개
  // onlyA = pickA=true  ∧ pickB=false → 4의 배수(27개) 중 12의 배수(9개)를 뺀 나머지 → 18개
  // both  = total − onlyA − onlyB − none = 108 − 18 − 27 − 9 = 54 (a=both+onlyA=72, b=both+onlyB=81 로 교차 검산)
  assert.equal(st.a, 72);
  assert.equal(st.b, 81);
  assert.equal(st.none, 9);
  assert.equal(st.onlyA, 18);
  assert.equal(st.onlyB, 27);
  assert.equal(st.both, 54);
});
