import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './harness/load-code-gs.mjs';

test('ping 은 인증 없이 ok 와 시트 접근 결과를 돌려준다', () => {
  const s = loadServer();
  const res = s.call({ action: 'ping' });
  assert.equal(res.ok, true);
  assert.equal(res.data.pong, true);
  assert.equal(res.data.sheetOk, true);
  assert.equal(res.data.at, '2026-08-12T09:00:00.000Z');
});

test('알 수 없는 action 은 SERVER_ERROR', () => {
  const s = loadServer();
  const res = s.call({ action: '없는액션' });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'SERVER_ERROR');
});

test('responses 시트가 없으면 sheetOk 가 false', () => {
  const s = loadServer();
  delete s.sheets.responses;
  const res = s.call({ action: 'ping' });
  assert.equal(res.ok, true);
  assert.equal(res.data.sheetOk, false);
});

/*
 * 운영자가 시트를 만들면서 헤더 행(README 1.3)을 빼먹으면: sheetOk 는 여전히 true,
 * 첫 응답자의 제출이 1행(헤더 자리)에 실려 이후 조회에서 계속 안 보이고, 집계는 0을
 * 가리키며, 그 사람은 재로그인 때 '신규'로 취급된다. 다시 제출하면 같은 이메일의
 * active 행이 둘이 되어 데이터 모델의 불변식이 깨진다. headerOk 는 이 사고를
 * 아무도 응답을 넣기 전에 test.html 에서 잡기 위한 것이다.
 */
test('헤더 행이 정확하면 headerOk 가 true', () => {
  const s = loadServer();
  const res = s.call({ action: 'ping' });
  assert.equal(res.ok, true);
  assert.equal(res.data.headerOk, true);
});

test('헤더 행이 없거나 틀리면 headerOk 가 false', () => {
  const s = loadServer();
  s.sheets.responses.getRange(1, 1, 1, 12).setValues([[
    'email', 'name', 'pickA', 'pickB', 'pw', 'salt',
    'createdAt', 'updatedAt', 'updatedBy', 'status', 'failCount', 'lockedUntil',
  ]]); // 5열이 'pwHash' 가 아니라 'pw' — 오타 하나로도 못 믿는 헤더가 된다
  const res = s.call({ action: 'ping' });
  assert.equal(res.ok, true);
  assert.equal(res.data.sheetOk, true, '시트 자체는 있다');
  assert.equal(res.data.headerOk, false);
});

test('헤더 행이 아예 비어 있으면(시트만 만들고 헤더를 안 넣은 경우) headerOk 가 false', () => {
  const s = loadServer();
  s.sheets.responses.getRange(1, 1, 1, 12).setValues([['', '', '', '', '', '', '', '', '', '', '', '']]);
  const res = s.call({ action: 'ping' });
  assert.equal(res.ok, true);
  assert.equal(res.data.sheetOk, true);
  assert.equal(res.data.headerOk, false);
});

test('responses 시트가 아예 없어도 ping 자체는 그대로 동작한다', () => {
  const s = loadServer();
  delete s.sheets.responses;
  const res = s.call({ action: 'ping' });
  assert.equal(res.ok, true);
  assert.equal(res.data.pong, true);
  assert.equal(res.data.sheetOk, false);
  assert.equal(res.data.headerOk, false, '시트가 없으면 헤더도 확인할 수 없다');
});
