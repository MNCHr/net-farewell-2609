/**
 * 전송 계층.
 *
 * Apps Script 는 CORS preflight(OPTIONS)에 응답할 수 없다.
 * 따라서 preflight 를 유발하지 않는 요청만 보낸다:
 *   - Content-Type 은 text/plain (CORS 안전목록 값)
 *   - 그 밖의 헤더는 하나도 붙이지 않는다
 * 그래도 막히는 사내망을 위해 JSONP 로 자동 전환한다.
 */

export const TRANSPORT = { FETCH: 'fetch', JSONP: 'jsonp' };

export function createApi({
  execUrl,
  fetchImpl = (...a) => fetch(...a),
  jsonpImpl = browserJsonp,
  onTransportChange = () => {},
}) {
  let chosen = null;

  async function viaFetch(payload) {
    const res = await fetchImpl(execUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // 프록시 차단 페이지가 200 으로 오는 경우가 있다.
      throw new Error('JSON 이 아닌 응답');
    }
    if (!parsed || typeof parsed.ok !== 'boolean') throw new Error('형식이 다른 응답');
    return parsed;
  }

  function viaJsonp(payload) {
    return jsonpImpl(execUrl, payload);
  }

  function pick(transport) {
    chosen = transport;
    onTransportChange(transport);
  }

  async function send(payload) {
    if (chosen === TRANSPORT.FETCH) return safe(viaFetch, payload);
    if (chosen === TRANSPORT.JSONP) return safe(viaJsonp, payload);

    try {
      const r = await viaFetch(payload);
      pick(TRANSPORT.FETCH);
      return r;
    } catch (fetchErr) {
      try {
        const r = await viaJsonp(payload);
        pick(TRANSPORT.JSONP);
        return r;
      } catch (jsonpErr) {
        return networkError(fetchErr, jsonpErr);
      }
    }
  }

  async function safe(fn, payload) {
    try {
      return await fn(payload);
    } catch (e) {
      return networkError(e, null);
    }
  }

  function networkError(a, b) {
    return {
      ok: false,
      error: 'NETWORK',
      message: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.',
      detail: [a && a.message, b && b.message].filter(Boolean).join(' / '),
    };
  }

  return {
    send,
    transport: () => chosen,
    reset: () => { chosen = null; },
  };
}

/** 브라우저 전용 JSONP. CORS 규칙 자체를 타지 않는다. */
export function browserJsonp(execUrl, payload, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const cb = '__jsonp_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e9).toString(36);
    const script = document.createElement('script');
    let done = false;

    const cleanup = () => {
      done = true;
      clearTimeout(timer);
      delete window[cb];
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    const timer = setTimeout(() => {
      if (!done) { cleanup(); reject(new Error('JSONP 시간 초과')); }
    }, timeoutMs);

    window[cb] = (data) => { if (!done) { cleanup(); resolve(data); } };
    script.onerror = () => { if (!done) { cleanup(); reject(new Error('JSONP 네트워크 오류')); } };

    script.src = execUrl
      + '?callback=' + encodeURIComponent(cb)
      + '&payload=' + encodeURIComponent(JSON.stringify(payload));
    document.head.appendChild(script);
  });
}
