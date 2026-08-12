import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, TRANSPORT } from '../assets/api.js';

const URL_ = 'https://script.google.com/macros/s/TEST/exec';

function fakeFetchOk(captured) {
  return async (url, opts) => {
    captured.push({ url, opts });
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, data: { via: 'fetch' } }) };
  };
}
const fetchBoom = async () => { throw new TypeError('Failed to fetch'); };
const jsonpOk = async () => ({ ok: true, data: { via: 'jsonp' } });
const jsonpBoom = async () => { throw new Error('JSONP timeout'); };

test('1차 fetch 가 되면 fetch 로 보내고 preflight 유발 헤더를 붙이지 않는다', async () => {
  const captured = [];
  const api = createApi({ execUrl: URL_, fetchImpl: fakeFetchOk(captured), jsonpImpl: jsonpBoom });
  const res = await api.send({ action: 'ping' });

  assert.equal(res.data.via, 'fetch');
  assert.equal(api.transport(), TRANSPORT.FETCH);

  const headers = captured[0].opts.headers;
  assert.deepEqual(Object.keys(headers), ['Content-Type']);
  assert.equal(headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(captured[0].opts.method, 'POST');
  assert.equal(captured[0].opts.body, JSON.stringify({ action: 'ping' }));
});

test('fetch 가 실패하면 JSONP 로 자동 전환한다', async () => {
  const api = createApi({ execUrl: URL_, fetchImpl: fetchBoom, jsonpImpl: jsonpOk });
  const res = await api.send({ action: 'ping' });
  assert.equal(res.data.via, 'jsonp');
  assert.equal(api.transport(), TRANSPORT.JSONP);
});

test('한번 정해진 전송 방식은 이후 요청에서 재시도 없이 유지된다', async () => {
  let fetchCalls = 0;
  const countingBoom = async () => { fetchCalls += 1; throw new TypeError('Failed to fetch'); };
  const api = createApi({ execUrl: URL_, fetchImpl: countingBoom, jsonpImpl: jsonpOk });

  await api.send({ action: 'ping' });
  await api.send({ action: 'ping' });
  await api.send({ action: 'ping' });

  assert.equal(fetchCalls, 1, 'fetch 는 첫 요청에서 한 번만 시도해야 한다');
});

test('HTTP 오류 상태는 fetch 실패로 취급해 JSONP 로 넘어간다', async () => {
  const fetch500 = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const api = createApi({ execUrl: URL_, fetchImpl: fetch500, jsonpImpl: jsonpOk });
  const res = await api.send({ action: 'ping' });
  assert.equal(res.data.via, 'jsonp');
});

test('둘 다 실패하면 throw 하지 않고 NETWORK 오류 객체를 돌려준다', async () => {
  const api = createApi({ execUrl: URL_, fetchImpl: fetchBoom, jsonpImpl: jsonpBoom });
  const res = await api.send({ action: 'ping' });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'NETWORK');
  assert.match(res.message, /연결/);
  assert.equal(api.transport(), null, '전송 방식을 확정하면 안 된다');
});

test('전송 방식이 정해지면 onTransportChange 가 한 번 불린다', async () => {
  const seen = [];
  const api = createApi({
    execUrl: URL_, fetchImpl: fetchBoom, jsonpImpl: jsonpOk,
    onTransportChange: (t) => seen.push(t),
  });
  await api.send({ action: 'ping' });
  await api.send({ action: 'ping' });
  assert.deepEqual(seen, [TRANSPORT.JSONP]);
});

test('JSON 이 아닌 응답은 fetch 실패로 취급한다', async () => {
  const fetchHtml = async () => ({ ok: true, status: 200, text: async () => '<html>login</html>' });
  const api = createApi({ execUrl: URL_, fetchImpl: fetchHtml, jsonpImpl: jsonpOk });
  const res = await api.send({ action: 'ping' });
  assert.equal(res.data.via, 'jsonp');
});
