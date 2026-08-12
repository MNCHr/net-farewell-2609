import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './harness/load-code-gs.mjs';

test('doPost 는 postData.contents 의 JSON 을 파싱해 handleRequest_ 결과를 JSON 문자열로 돌려준다', () => {
  const s = loadServer();
  const e = { postData: { contents: JSON.stringify({ action: 'ping' }) } };
  const out = s.fn.doPost(e);
  const parsed = JSON.parse(out.getContent());

  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.pong, true);
  assert.equal(out.getMimeType(), s.fn.ContentService.MimeType.JSON);
});

test('doPost 에 깨진 JSON 이 오면 던지지 않고 SERVER_ERROR 를 돌려준다', () => {
  const s = loadServer();
  const e = { postData: { contents: '{ 이건 JSON 이 아님' } };
  const out = s.fn.doPost(e);
  const parsed = JSON.parse(out.getContent());

  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'SERVER_ERROR');
});

test('doGet 은 정상 콜백 이름으로 콜백명(JSON); 형태를 돌려준다', () => {
  const s = loadServer();
  const e = { parameter: { callback: 'myCallback_1', payload: JSON.stringify({ action: 'ping' }) } };
  const out = s.fn.doGet(e);
  const content = out.getContent();

  assert.ok(content.startsWith('myCallback_1('));
  assert.ok(content.endsWith(');'));
  const body = content.slice('myCallback_1('.length, -2);
  const parsed = JSON.parse(body);
  assert.equal(parsed.ok, true);
  assert.equal(out.getMimeType(), s.fn.ContentService.MimeType.JAVASCRIPT);
});

test('doGet 은 콜백 이름을 살균해 위험한 문자를 제거한 뒤에만 사용한다', () => {
  const s = loadServer();
  const e = { parameter: { callback: 'alert(1)//', payload: JSON.stringify({ action: 'ping' }) } };
  const out = s.fn.doGet(e);
  const content = out.getContent();

  const idx = content.indexOf('(');
  const cbName = content.slice(0, idx);
  assert.equal(cbName, 'alert1', '괄호/슬래시가 제거된 콜백 이름이어야 한다');
  assert.ok(!/[()/]/.test(cbName), '콜백 이름 자리에 (, ), / 가 남아있으면 안 된다');
  assert.ok(!content.includes('alert(1)//'), '원본(살균 전) 콜백 문자열이 그대로 남아있으면 안 된다');
});

test('doGet 에 콜백이 없으면 JSONP 가 아니라 순수 JSON 으로 돌려준다', () => {
  const s = loadServer();
  const e = { parameter: { payload: JSON.stringify({ action: 'ping' }) } };
  const out = s.fn.doGet(e);
  const content = out.getContent();

  const parsed = JSON.parse(content); // 감싸여 있었다면 파싱이 실패했을 것
  assert.equal(parsed.ok, true);
  assert.equal(out.getMimeType(), s.fn.ContentService.MimeType.JSON);
});
