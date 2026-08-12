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
