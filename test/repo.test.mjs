import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer, HEADER_RESPONSES } from './harness/load-code-gs.mjs';

const A = ['01234', '홍길동', true, false, 'HASH', 'SALT',
           '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'self', 'active', 0, ''];
const B = ['00777', '김철수', false, false, '', '',
           '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z', 'admin', 'deleted', 0, ''];

test('readRows_ 는 헤더를 건너뛰고 1-based rowIndex 를 붙인다', () => {
  const s = loadServer({ responses: [A, B] });
  const rows = s.fn.readRows_();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].rowIndex, 2, '첫 데이터 행은 시트의 2행이다');
  assert.equal(rows[0].empNo, '01234');
  assert.equal(rows[0].pickA, true);
  assert.equal(rows[1].rowIndex, 3);
  assert.equal(rows[1].status, 'deleted');
});

test('빈 시트에서 readRows_ 는 빈 배열', () => {
  const s = loadServer();
  // s.fn.readRows_() 는 하네스의 call()/rows()/logRows() 경계를 거치지 않고 sandbox 함수를
  // 직접 호출한다 (fn 은 의도적으로 hostify 하지 않는다 — load-code-gs.mjs 참고). 그래서
  // 돌려받는 배열은 여전히 sandbox realm 이고, host `[]` 리터럴과 deepEqual 로 비교하면
  // 내용이 같아도 realm 불일치로 실패한다. 여기서는 "비어 있는가"만 확인하면 되므로
  // realm 이 없는 원시값(length)을 비교해 그 문제를 피한다.
  assert.equal(s.fn.readRows_().length, 0);
});

test('시트에 숫자로 저장된 사번도 정규화해서 읽는다', () => {
  // A열 서식을 텍스트로 안 해두면 구글이 1234 로 저장해버린다. 그래도 살아남아야 한다.
  const s = loadServer({ responses: [[1234, '홍길동', false, false, '', '', '', '', 'self', 'active', 0, '']] });
  assert.equal(s.fn.readRows_()[0].empNo, '01234');
});

test('findByEmpNo_ 는 active 만 찾고 findAnyByEmpNo_ 는 삭제분도 준다', () => {
  const s = loadServer({ responses: [A, B] });
  const rows = s.fn.readRows_();
  assert.equal(s.fn.findByEmpNo_(rows, '01234').name, '홍길동');
  assert.equal(s.fn.findByEmpNo_(rows, '00777'), null, 'deleted 는 안 잡힌다');
  assert.equal(s.fn.findAnyByEmpNo_(rows, '00777').length, 1);
});

test('appendRow_ 는 시트에 쓰고 rowIndex 를 채워 돌려준다', () => {
  const s = loadServer();
  const row = s.fn.blankRow_('00042', '이영희');
  const saved = s.fn.appendRow_(row);
  assert.equal(saved.rowIndex, 2);
  assert.equal(s.rows().length, 1);
  assert.equal(s.rows()[0][0], '00042');
  assert.equal(s.rows()[0][9], 'active');
});

test('writeRow_ 는 해당 행만 덮어쓴다', () => {
  const s = loadServer({ responses: [A, B] });
  const rows = s.fn.readRows_();
  const target = rows[0];
  target.pickB = true;
  target.name = '홍길순';
  s.fn.writeRow_(target);

  assert.equal(s.rows()[0][1], '홍길순');
  assert.equal(s.rows()[0][3], true);
  assert.equal(s.rows()[1][1], '김철수', '다른 행은 그대로여야 한다');
});

test('blankRow_ 는 12칸을 기본값으로 채운다', () => {
  const s = loadServer();
  const row = s.fn.blankRow_('00042', '이영희');
  assert.equal(row.empNo, '00042');
  assert.equal(row.pickA, false);
  assert.equal(row.pwHash, '');
  assert.equal(row.status, 'active');
  assert.equal(row.failCount, 0);
  assert.equal(row.createdAt, '2026-08-12T09:00:00.000Z');
});

test('writeLog_ 는 log 시트에 한 줄 남긴다', () => {
  const s = loadServer();
  s.fn.writeLog_('create', '00042', 'self', 'picks=A');
  const logs = s.logRows();
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], ['2026-08-12T09:00:00.000Z', 'create', '00042', 'self', 'picks=A']);
});

test('해시는 솔트가 다르면 달라지고 같으면 재현된다', () => {
  const s = loadServer();
  const h1 = s.fn.hashPw_('saltA', '1234');
  const h2 = s.fn.hashPw_('saltA', '1234');
  const h3 = s.fn.hashPw_('saltB', '1234');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.notEqual(h1, '1234');
  assert.match(h1, /^[A-Za-z0-9+/]+=*$/);
});

test('newSalt_ 는 매번 다른 값을 준다', () => {
  const s = loadServer();
  assert.notEqual(s.fn.newSalt_(), s.fn.newSalt_());
});

test('withLock_ 은 락을 못 잡으면 BUSY 를 돌려주고 fn 을 실행하지 않는다', () => {
  const s = loadServer({ lockFails: true });
  let ran = false;
  const res = s.fn.withLock_(() => { ran = true; return { ok: true, data: {} }; });
  assert.equal(ran, false);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'BUSY');
});

test('헤더 상수가 시트 열 순서와 일치한다', () => {
  const s = loadServer();
  assert.equal(HEADER_RESPONSES.length, s.fn.NCOLS);
  assert.equal(HEADER_RESPONSES[s.fn.COL.EMPNO - 1], 'empNo');
  assert.equal(HEADER_RESPONSES[s.fn.COL.LOCKED - 1], 'lockedUntil');
});
