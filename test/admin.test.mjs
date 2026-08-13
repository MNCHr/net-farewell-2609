import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './harness/load-code-gs.mjs';

const SALT = 'admin-salt';
function adminProps(pw = 'adminpass') {
  const s = loadServer();
  return { ADMIN_SALT: SALT, ADMIN_PW_HASH: s.fn.hashPw_(SALT, pw) };
}
function row(email, name, a, b, extra = {}) {
  return [email, name, a, b, extra.pwHash === undefined ? 'H' : extra.pwHash, 'S',
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', extra.by || 'self',
          extra.status || 'active', 0, ''];
}

/* ---------- 통계 ---------- */

test('computeStats_ 는 분포를 세고 합계가 맞는다', () => {
  const s = loadServer({
    responses: [
      row('kim@etri.re.kr', '가', true, true), row('lee@etri.re.kr', '나', true, true),
      row('park@etri.re.kr', '다', true, false), row('choi@etri.re.kr', '라', false, true),
      row('jung@etri.re.kr', '마', false, false),
      row('kang@etri.re.kr', '바', true, true, { status: 'deleted' }),
    ],
    properties: adminProps(),
  });
  const st = s.call({ action: 'adminData', adminPw: 'adminpass' }).data.stats;

  assert.equal(st.total, 5, 'deleted 는 빠진다');
  assert.equal(st.both, 2);
  assert.equal(st.onlyA, 1);
  assert.equal(st.onlyB, 1);
  assert.equal(st.none, 1);
  assert.equal(st.a, 3);
  assert.equal(st.b, 3);
  assert.equal(st.both + st.onlyA + st.onlyB + st.none, st.total);
  assert.equal(st.a, st.both + st.onlyA);
  assert.equal(st.b, st.both + st.onlyB);
});

test('빈 시트의 통계는 전부 0', () => {
  const s = loadServer({ properties: adminProps() });
  const st = s.call({ action: 'adminData', adminPw: 'adminpass' }).data.stats;
  assert.deepEqual(st, { total: 0, a: 0, b: 0, both: 0, onlyA: 0, onlyB: 0, none: 0 });
});

/* ---------- 권한 ---------- */

test('관리자 비밀번호가 틀리면 데이터를 한 조각도 주지 않는다', () => {
  // 이름은 한 글자짜리('가')를 쓰지 않는다. 흔한 음절이라 오류 문구의 조사
  // ('비밀번호가')와 겹쳐서, 데이터가 안 샜는데도 샌 것처럼 잡힌다.
  const s = loadServer({ responses: [row('hong@etri.re.kr', '홍길동', true, true)], properties: adminProps() });
  const res = s.call({ action: 'adminData', adminPw: '틀림' });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'ADMIN_DENIED');
  assert.equal(/hong@etri\.re\.kr|홍길동/.test(JSON.stringify(res)), false);
});

test('관리자 비밀번호가 설정돼 있지 않으면 거부한다', () => {
  const s = loadServer({ responses: [row('kim@etri.re.kr', '가', true, true)] });
  assert.equal(s.call({ action: 'adminData', adminPw: '아무거나' }).error, 'ADMIN_DENIED');
});

test('관리자도 5회 실패하면 잠긴다', () => {
  const s = loadServer({ properties: adminProps() });
  for (let i = 0; i < 5; i += 1) s.call({ action: 'adminData', adminPw: '틀림' });
  const res = s.call({ action: 'adminData', adminPw: 'adminpass' });
  assert.equal(res.error, 'LOCKED', '올바른 비밀번호라도 잠금 중엔 거부');

  s.setNow('2026-08-12T09:11:00.000Z');
  assert.equal(s.call({ action: 'adminData', adminPw: 'adminpass' }).ok, true, '10분 뒤 해제');
});

test('관리자 응답에 pwHash 와 salt 가 없고 hasPw 만 있다', () => {
  const s = loadServer({
    responses: [row('kim@etri.re.kr', '가', true, true), row('lee@etri.re.kr', '나', false, false, { pwHash: '' })],
    properties: adminProps(),
  });
  const res = s.call({ action: 'adminData', adminPw: 'adminpass' });
  assert.equal(/pwHash|"H"|"S"/.test(JSON.stringify(res)), false);
  assert.equal(res.data.rows[0].hasPw, true);
  assert.equal(res.data.rows[1].hasPw, false);
});

/* ---------- 경고 ---------- */

test('같은 이름 다른 이메일을 경고한다', () => {
  const s = loadServer({
    responses: [row('hong@etri.re.kr', '홍길동', true, false), row('hong2@etri.re.kr', '홍길동', false, true)],
    properties: adminProps(),
  });
  const w = s.call({ action: 'adminData', adminPw: 'adminpass' }).data.warnings;
  const hit = w.find((x) => x.type === 'SAME_NAME_DIFF_EMAIL');
  assert.ok(hit, '오타 후보를 잡아야 한다');
  assert.equal(hit.name, '홍길동');
  assert.deepEqual(hit.emails.sort(), ['hong@etri.re.kr', 'hong2@etri.re.kr'].sort());
});

test('같은 이메일 다른 이름을 삭제분까지 훑어 경고한다', () => {
  const s = loadServer({
    responses: [row('kim@etri.re.kr', '김철수', true, false, { status: 'deleted' }),
                row('kim@etri.re.kr', '김철순', false, true)],
    properties: adminProps(),
  });
  const w = s.call({ action: 'adminData', adminPw: 'adminpass' }).data.warnings;
  const hit = w.find((x) => x.type === 'SAME_EMAIL_DIFF_NAME');
  assert.ok(hit);
  assert.equal(hit.email, 'kim@etri.re.kr');
  assert.deepEqual(hit.names.sort(), ['김철수', '김철순'].sort());
});

test('정상 데이터에는 경고가 없다', () => {
  const s = loadServer({
    responses: [row('kim@etri.re.kr', '가', true, true), row('lee@etri.re.kr', '나', false, false)],
    properties: adminProps(),
  });
  assert.deepEqual(s.call({ action: 'adminData', adminPw: 'adminpass' }).data.warnings, []);
});

test('이름이 constructor 여도 adminData 가 죽지 않는다', () => {
  // byName/byEmp 를 {} 로 두면 이름이 'constructor' 인 사람이 들어왔을 때
  // byName['constructor'] 가 상속된 Object.prototype.constructor 로 읽혀 truthy가 되고,
  // 뒤이은 byName[n].indexOf(...) 가 함수를 배열처럼 다뤄 던진다. 그 예외가
  // handleRequest_ 의 catch 까지 올라가 adminData 전체가 SERVER_ERROR 로 죽는다 —
  // 통계·경고·명단·표 복사가 전부 막힌다.
  const s = loadServer({
    responses: [row('kim@etri.re.kr', 'constructor', true, true)],
    properties: adminProps(),
  });
  const res = s.call({ action: 'adminData', adminPw: 'adminpass' });
  assert.equal(res.ok, true, 'constructor 라는 이름 하나가 관리자 화면 전체를 죽이면 안 된다');
  assert.equal(res.data.stats.total, 1);
  assert.equal(res.data.stats.both, 1);
  assert.deepEqual(res.data.warnings, []);
});

test('이메일이 toString 등 상속 프로퍼티 이름과 겹쳐도 경고 계산이 죽지 않는다', () => {
  // 이메일은 normalizeEmail_ 을 거치면 항상 '@etri.re.kr' 이 붙으므로, readRows_ 경로로는
  // byEmp 의 키가 'toString' 같은 상속 프로퍼티 이름과 그대로 겹칠 수 없다(사번과 달리
  // 숫자 제약이 없어 정규화가 실패하지 않기 때문). 그래도 byEmp 자체의 Object.create(null)
  // 방어는 여전히 옳은 방어선이므로, computeWarnings_ 를 직접 불러 합성 행으로 확인한다.
  const s = loadServer();
  const rows = [
    { email: 'toString', name: '가', status: 'deleted' },
    { email: 'toString', name: '나', status: 'active' },
  ];
  const warnings = s.fn.computeWarnings_(rows);
  const hit = warnings.find((w) => w.type === 'SAME_EMAIL_DIFF_NAME');
  assert.ok(hit, '경고 자체는 여전히 잡아야 한다');
  assert.equal(hit.email, 'toString');
});

/* ---------- 조작 ---------- */

test('adminResetPw 는 비번을 비우고 잠금도 푼다', () => {
  const s = loadServer({
    responses: [['hong@etri.re.kr', '홍길동', true, false, 'H', 'S',
                 '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'self',
                 'active', 5, '2026-08-12T09:30:00.000Z']],
    properties: adminProps(),
  });
  const res = s.call({ action: 'adminResetPw', adminPw: 'adminpass', email: 'HONG' });
  assert.equal(res.ok, true);
  assert.equal(s.rows()[0][4], '');
  assert.equal(s.rows()[0][5], '');
  assert.equal(s.rows()[0][10], 0);
  assert.equal(s.rows()[0][11], '');
  assert.equal(s.rows()[0][2], true, '선택은 건드리지 않는다');
  assert.equal(s.logRows()[0][1], 'admin_reset_pw');
});

test('초기화 뒤 그 사람이 새 비번으로 들어간다', () => {
  const s = loadServer({
    responses: [['hong@etri.re.kr', '홍길동', true, false, 'H', 'S',
                 '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'self', 'active', 0, '']],
    properties: adminProps(),
  });
  s.call({ action: 'adminResetPw', adminPw: 'adminpass', email: 'hong@etri.re.kr' });
  assert.equal(s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '4321' }).data.mode, 'claim');
  s.call({ action: 'save', email: 'hong@etri.re.kr', name: '홍길동', pw: '4321', pickA: true, pickB: true });
  assert.equal(s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '4321' }).data.mode, 'existing');
});

test('adminUpsert 는 없으면 만들고 비밀번호는 비워둔다', () => {
  const s = loadServer({ properties: adminProps() });
  const res = s.call({ action: 'adminUpsert', adminPw: 'adminpass', email: 'OHYOUNG', name: '이 영희', pickA: true, pickB: false });

  assert.equal(res.ok, true);
  assert.equal(s.rows().length, 1);
  assert.equal(s.rows()[0][0], 'ohyoung@etri.re.kr', '이메일을 정규화해서 넣는다');
  assert.equal(s.rows()[0][1], '이영희');
  assert.equal(s.rows()[0][4], '', '관리자는 남의 비밀번호를 정하지 않는다');
  assert.equal(s.rows()[0][8], 'admin');
});

test('adminUpsert 는 있으면 갱신한다', () => {
  const s = loadServer({ responses: [row('hong@etri.re.kr', '홍길동', false, false)], properties: adminProps() });
  s.call({ action: 'adminUpsert', adminPw: 'adminpass', email: 'hong@etri.re.kr', name: '홍길동', pickA: true, pickB: true });
  assert.equal(s.rows().length, 1);
  assert.equal(s.rows()[0][2], true);
  assert.equal(s.rows()[0][4], 'H', '기존 비밀번호는 보존한다');
});

test('adminUpsert 는 삭제된 행을 되살릴 때 비밀번호는 지키고 잠금은 푼다', () => {
  const salt = 'revive-salt';
  const pwHash = loadServer().fn.hashPw_(salt, '1234');
  const s = loadServer({
    responses: [['hong@etri.re.kr', '홍길동', true, false, pwHash, salt,
                 '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'self',
                 'deleted', 5, '2026-08-12T09:30:00.000Z']],
    properties: adminProps(),
  });

  const res = s.call({
    action: 'adminUpsert', adminPw: 'adminpass',
    email: 'hong@etri.re.kr', name: '홍길동', pickA: false, pickB: true,
  });
  assert.equal(res.ok, true);

  assert.equal(s.rows().length, 1, '중복 행이 생기면 안 된다');
  assert.equal(s.rows()[0][9], 'active', 'status 가 되살아나야 한다');
  assert.equal(s.rows()[0][4], pwHash, '비밀번호 해시는 손대지 않는다 — 대리 입력이 아니라 복구다');
  assert.equal(s.rows()[0][5], salt, '솔트도 그대로 보존된다');
  assert.equal(s.rows()[0][8], 'admin', 'updatedBy 는 admin 이어야 한다');
  assert.equal(s.rows()[0][10], 0, '삭제 전의 잠금 카운터가 남아 있으면 안 된다');
  assert.equal(s.rows()[0][11], '', '삭제 전의 잠금 시각도 남아 있으면 안 된다');

  // 원래 비밀번호로 바로 인증되어야 한다 — 잠겨 있던 채로 되살아나면 안 된다.
  const auth = s.call({ action: 'auth', email: 'hong@etri.re.kr', name: '홍길동', pw: '1234' });
  assert.equal(auth.ok, true);
  assert.equal(auth.data.mode, 'existing', '되살린 뒤에도 원래 비밀번호를 알던 사람이다');
});

test('adminDelete 는 행을 지우지 않고 status 만 바꾼다', () => {
  const s = loadServer({ responses: [row('hong@etri.re.kr', '홍길동', true, true)], properties: adminProps() });
  const res = s.call({ action: 'adminDelete', adminPw: 'adminpass', email: 'hong@etri.re.kr' });

  assert.equal(res.ok, true);
  assert.equal(s.rows().length, 1, '행이 남아 있어야 복구할 수 있다');
  assert.equal(s.rows()[0][9], 'deleted');
  assert.equal(s.call({ action: 'adminData', adminPw: 'adminpass' }).data.stats.total, 0);
  assert.equal(s.logRows()[0][1], 'admin_delete');
});

test('없는 이메일을 지우거나 초기화하면 NOT_FOUND', () => {
  const s = loadServer({ properties: adminProps() });
  assert.equal(s.call({ action: 'adminDelete', adminPw: 'adminpass', email: 'nobody' }).error, 'NOT_FOUND');
  assert.equal(s.call({ action: 'adminResetPw', adminPw: 'adminpass', email: 'nobody' }).error, 'NOT_FOUND');
});

test('관리자 조작도 권한이 없으면 아무것도 바꾸지 않는다', () => {
  const s = loadServer({ responses: [row('hong@etri.re.kr', '홍길동', true, true)], properties: adminProps() });
  assert.equal(s.call({ action: 'adminDelete', adminPw: '틀림', email: 'hong@etri.re.kr' }).error, 'ADMIN_DENIED');
  assert.equal(s.rows()[0][9], 'active');
});

test('setupAdminPassword 가 해시와 솔트를 저장한다', () => {
  const s = loadServer();
  s.fn.setAdminPassword_('mypassword');
  const store = s.fn.PropertiesService.getScriptProperties().getProperties();
  assert.ok(store.ADMIN_SALT);
  assert.ok(store.ADMIN_PW_HASH);
  assert.equal(/mypassword/.test(JSON.stringify(store)), false, '원문을 저장하면 안 된다');
});

/* ---------- 락 ---------- */

// handleAdminData_/handleAdminResetPw_/handleAdminUpsert_/handleAdminDelete_ 모두
// withLock_ 으로 감싸야 한다 — Code.gs 의 handleAdminData_ 위 주석이 그 이유를 설명한다:
// 읽기처럼 보이는 adminData 도 requireAdmin_ 이 실패 카운터를 읽고 쓰므로, 락 없이는
// 동시에 들어온 두 번의 오입력이 서로의 쓰기를 덮어써 5회 잠금이 걸리지 않는다.
// withLock_ 을 빼도(그 주석이 하지 말라고 적어둔 바로 그 실수) 다른 96개 테스트는
// 전부 그대로 통과했다 — 그래서 네 관리자 액션 각각이 BUSY 를 돌려주는지 직접 검증한다.
test('adminData 도 락을 못 잡으면 BUSY', () => {
  const s = loadServer({ responses: [row('kim@etri.re.kr', '가', true, true)], properties: adminProps(), lockFails: true });
  const res = s.call({ action: 'adminData', adminPw: 'adminpass' });
  assert.equal(res.error, 'BUSY');
});

test('adminResetPw 도 락을 못 잡으면 BUSY 이고 아무것도 바뀌지 않는다', () => {
  const s = loadServer({ responses: [row('hong@etri.re.kr', '홍길동', true, false)], properties: adminProps(), lockFails: true });
  const res = s.call({ action: 'adminResetPw', adminPw: 'adminpass', email: 'hong@etri.re.kr' });
  assert.equal(res.error, 'BUSY');
  assert.equal(s.rows()[0][4], 'H', '비번 해시가 그대로여야 한다');
});

test('adminUpsert 도 락을 못 잡으면 BUSY 이고 새 행이 생기지 않는다', () => {
  const s = loadServer({ properties: adminProps(), lockFails: true });
  const res = s.call({ action: 'adminUpsert', adminPw: 'adminpass', email: 'hong@etri.re.kr', name: '홍길동', pickA: true, pickB: true });
  assert.equal(res.error, 'BUSY');
  assert.equal(s.rows().length, 0);
});

test('adminDelete 도 락을 못 잡으면 BUSY 이고 status 가 그대로다', () => {
  const s = loadServer({ responses: [row('hong@etri.re.kr', '홍길동', true, true)], properties: adminProps(), lockFails: true });
  const res = s.call({ action: 'adminDelete', adminPw: 'adminpass', email: 'hong@etri.re.kr' });
  assert.equal(res.error, 'BUSY');
  assert.equal(s.rows()[0][9], 'active');
});
