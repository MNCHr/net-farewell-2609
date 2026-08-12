# 퇴임 선물 참여 조사 사이트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 본부 인원 108명이 퇴직하는 두 분 각각에 대해 선물 참여 여부를 체크·수정하고, 관리자가 집계·비밀번호 초기화·대리 입력을 할 수 있는 정적 사이트를 만든다.

**Architecture:** GitHub Pages가 정적 화면을, Apps Script 웹앱이 API를, 관리자 개인 구글시트가 저장소를 맡는다. 모든 검증(비밀번호·관리자 권한·정규화 최종 판정·통계)은 Apps Script 안에서만 일어나고 브라우저는 신뢰받지 않는다. Apps Script는 `OPTIONS`에 응답할 수 없으므로 CORS preflight를 유발하지 않는 요청만 보내며, 실패 시 JSONP로 자동 전환한다.

**Tech Stack:** 프레임워크 없음. 바닐라 JS(ES 모듈) · Apps Script(V8) · Google Sheets · Node 18 `node --test` · `node:vm`으로 `Code.gs`를 로컬에서 실행해 테스트.

**설계 문서:** `docs/superpowers/specs/2026-08-12-farewell-gift-survey-design.md` — 판정표·오류코드·화면 문구의 정본. 충돌하면 스펙이 이긴다.

## Global Constraints

- 사번은 **5자리**. 숫자만 남기고 5자리가 될 때까지 **앞에 `0`을 채운다**. 6자리 이상·빈 값은 오류
- 이름은 **모든 공백 제거 + NFC 정규화**. 빈 값·20자 초과는 오류
- 비밀번호는 **숫자 4자리**. 저장은 `Base64(SHA-256(salt + pw))`, **원문은 어디에도 저장하지 않는다**
- 정규화 규칙은 `assets/normalize.js`(브라우저)와 `apps-script/Code.gs`(서버)에 **두 벌 존재**한다. `test/cases/normalize-cases.mjs`의 **동일한 케이스 표로 양쪽을 모두 검증**한다
- 비밀번호 연속 실패 **5회** → **10분** 잠금. 잠금 중엔 카운터를 올리지 않는다. 해제 후 첫 요청에서 카운터를 0으로 되돌린 뒤 판정한다. 성공하면 언제나 0으로 초기화
- 쓰기 작업은 `LockService.getScriptLock()`으로 직렬화. 대기 **30초**, 초과 시 `BUSY`
- HTTP 요청은 `Content-Type: text/plain;charset=utf-8` **단 하나의 헤더만** 사용한다. 커스텀 헤더를 붙이면 preflight가 발동해 실패한다
- 삭제는 **soft delete** (`status='deleted'`). 시트에서 행을 지우지 않는다
- 참여자 API 응답에 `pwHash`·`salt`를 **절대 포함하지 않는다**. 관리자 응답도 마찬가지이며 `hasPw` 불리언만 내려보낸다
- 사용자에게 보여줄 한국어 문구는 **서버가 만들어 `message` 필드로 내려보낸다**
- GitHub Pages 사이트는 항상 공개다. `robots.txt` + `<meta name="robots" content="noindex,nofollow">`로 검색엔진 색인을 차단한다
- **`명단.md`를 비롯한 개인정보 파일을 커밋하지 않는다.** `.gitignore`에 등록되어 있다. 명단이 필요하면 관리자 개인 드라이브의 비공개 시트에만 둔다
- 시각은 전부 `now_()`(서버) 헬퍼를 거친다. 테스트가 시간을 고정할 수 있어야 한다

## 스펙과 다르게 가는 곳

스펙 §9는 브라우저 테스트 러너 `tests.html` 과 Apps Script 편집기에서 돌리는
`runTests_()` 를 제안했다. **이 계획은 둘 다 만들지 않고 Node 단위 테스트로 대체한다.**

`node:vm` 으로 `Code.gs` 를 인메모리 페이크 위에 올려 실행할 수 있음을 확인했다.
그래서 브라우저를 띄우거나 배포하지 않고도 서버 로직 전체를 `npm test` 로 돌릴 수 있고,
같은 테스트가 `assets/normalize.js` 도 함께 검증한다. 러너를 두 개 더 두는 것보다
**한 곳에서 양쪽 구현을 비교**하는 편이 규칙이 어긋나는 걸 확실히 잡는다.

대신 잃는 것이 하나 있다: vm 은 실제 Apps Script 런타임이 아니다.
런타임 차이(특히 구형 Rhino 에는 `String.prototype.normalize` 가 없다)는 테스트가 못 잡는다.
그래서 Task 12에서 **V8 런타임 확인**과 **실제 배포본 시나리오 점검**을 반드시 거친다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `package.json` | 테스트 스크립트만. 런타임 의존성 없음 |
| `apps-script/Code.gs` | 서버 전부. 정규화·인증·잠금·저장·통계·관리자. **저장소가 정본**, 편집기는 사본 |
| `assets/config.js` | 퇴직자 표기 2건, `/exec` 주소. **운영 중 고칠 값은 전부 여기에만** |
| `assets/normalize.js` | 사번·이름·비밀번호 정규화. 순수 함수, DOM 무관 |
| `assets/api.js` | 전송 계층. fetch↔JSONP 전환, 오류 정규화. `fetch`/`jsonp` 주입 가능 |
| `assets/app.js` | 참여자 5단계 화면 전환 |
| `assets/admin.js` | 관리자 화면 |
| `assets/style.css` | 공통 스타일 |
| `index.html` / `admin.html` / `test.html` | 각 화면의 뼈대 |
| `robots.txt` | 전체 크롤링 차단 |
| `test/harness/apps-script-fakes.mjs` | `SpreadsheetApp`·`Utilities`·`PropertiesService`·`LockService` 인메모리 페이크 |
| `test/harness/load-code-gs.mjs` | `Code.gs`를 `node:vm`에 올려 함수를 꺼내주는 로더 |
| `test/cases/normalize-cases.mjs` | 브라우저·서버 공용 정규화 케이스 표 |
| `test/*.test.mjs` | 테스트 |

`app.js`와 `admin.js`를 나누는 이유는 참여자 화면과 관리자 화면이 함께 바뀔 일이 없기 때문이다. `normalize.js`를 따로 두는 이유는 이것만이 서버와 규칙을 공유해 양쪽 검증이 필요한 유일한 조각이기 때문이다.

**의존 방향:** `app.js`/`admin.js` → `api.js` → (주입된 fetch/jsonp). `app.js`/`admin.js` → `normalize.js`, `config.js`. 역방향 의존은 없다.

---

## Task 1: 프로젝트 뼈대와 테스트 하네스

**Files:**
- Create: `package.json`
- Create: `apps-script/Code.gs`
- Create: `test/harness/apps-script-fakes.mjs`
- Create: `test/harness/load-code-gs.mjs`
- Test: `test/ping.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `loadServer(opts) → { call(req), fn, sheets, setNow(iso), rows(), logRows() }` — 이후 모든 서버 테스트의 진입점
  - `HEADER_RESPONSES`, `HEADER_LOG` — 시트 헤더 배열
  - `Code.gs`의 `handleRequest_(req) → {ok:true,data} | {ok:false,error,message}`
  - `Code.gs`의 `now_() → Date` (테스트가 교체한다)

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "farewell-gift-survey",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/*.test.mjs",
    "serve": "python3 -m http.server 8080"
  }
}
```

`type: module`이라 `assets/*.js`를 테스트에서 `import`할 수 있다. 런타임 의존성은 없다 — 사이트는 npm 없이 정적 파일만으로 동작해야 한다.

- [ ] **Step 2: Apps Script 페이크 작성**

`test/harness/apps-script-fakes.mjs`:

```js
import crypto from 'node:crypto';

// Apps Script 의 computeDigest 는 "부호 있는" 바이트(-128..127)를 돌려준다.
// 이 부호 처리를 흉내내지 않으면 해시값이 실제 배포본과 달라진다.
export function makeUtilities() {
  let uuidSeq = 0;
  return {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(_alg, str) {
      const buf = crypto.createHash('sha256').update(String(str), 'utf8').digest();
      return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
    },
    base64Encode(input) {
      if (typeof input === 'string') return Buffer.from(input, 'utf8').toString('base64');
      return Buffer.from(input.map((b) => (b < 0 ? b + 256 : b))).toString('base64');
    },
    getUuid() {
      uuidSeq += 1;
      return `00000000-0000-4000-8000-${String(uuidSeq).padStart(12, '0')}`;
    },
  };
}

export function makeSheet(name, rows) {
  const data = rows.map((r) => r.slice());
  const sheet = {
    getName: () => name,
    getLastRow: () => data.length,
    getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) }),
    appendRow(row) { data.push(row.slice()); },
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValues: () =>
          Array.from({ length: numRows }, (_, i) =>
            Array.from({ length: numCols }, (_, j) => data[row - 1 + i][col - 1 + j])),
        setValues(values) {
          for (let i = 0; i < numRows; i += 1) {
            for (let j = 0; j < numCols; j += 1) data[row - 1 + i][col - 1 + j] = values[i][j];
          }
        },
      };
    },
    __rows: () => data,
  };
  return sheet;
}

export function makeSpreadsheetApp(sheets) {
  return {
    getActive: () => ({ getSheetByName: (n) => sheets[n] || null }),
    getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null }),
  };
}

export function makePropertiesService(initial) {
  const store = { ...initial };
  const props = {
    getProperty: (k) => (k in store ? String(store[k]) : null),
    setProperty(k, v) { store[k] = String(v); return props; },
    deleteProperty(k) { delete store[k]; return props; },
    getProperties: () => ({ ...store }),
  };
  return { getScriptProperties: () => props, __store: store };
}

export function makeLockService({ fail = false } = {}) {
  return {
    getScriptLock: () => ({
      tryLock: () => !fail,
      releaseLock: () => {},
    }),
  };
}
```

`makeSheet`는 `getDataRange().getValues()`가 **복사본**을 돌려준다. 실제 Apps Script도 그러므로, 서버 코드가 반환값을 직접 수정해놓고 저장했다고 착각하는 버그를 테스트가 잡아준다.

- [ ] **Step 3: 로더 작성**

`test/harness/load-code-gs.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  makeUtilities, makeSheet, makeSpreadsheetApp, makePropertiesService, makeLockService,
} from './apps-script-fakes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CODE_PATH = path.join(ROOT, 'apps-script', 'Code.gs');

export const HEADER_RESPONSES = [
  'empNo', 'name', 'pickA', 'pickB', 'pwHash', 'salt',
  'createdAt', 'updatedAt', 'updatedBy', 'status', 'failCount', 'lockedUntil',
];
export const HEADER_LOG = ['at', 'action', 'empNo', 'actor', 'detail'];

export function loadServer({
  responses = [],
  properties = {},
  now = '2026-08-12T09:00:00.000Z',
  lockFails = false,
} = {}) {
  const sheets = {
    responses: makeSheet('responses', [HEADER_RESPONSES, ...responses]),
    log: makeSheet('log', [HEADER_LOG]),
  };
  const sandbox = {
    Utilities: makeUtilities(),
    SpreadsheetApp: makeSpreadsheetApp(sheets),
    PropertiesService: makePropertiesService(properties),
    LockService: makeLockService({ fail: lockFails }),
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CODE_PATH, 'utf8'), sandbox, { filename: 'Code.gs' });

  let current = new Date(now);
  sandbox.now_ = () => new Date(current.getTime());   // 시간 고정

  return {
    call: (req) => sandbox.handleRequest_(req),
    fn: sandbox,
    sheets,
    setNow: (iso) => { current = new Date(iso); },
    rows: () => sheets.responses.__rows().slice(1),
    logRows: () => sheets.log.__rows().slice(1),
  };
}
```

- [ ] **Step 4: 실패하는 테스트 작성**

`test/ping.test.mjs`:

```js
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
```

- [ ] **Step 5: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Code.gs` 파일이 없어 `ENOENT`

- [ ] **Step 6: `Code.gs` 골격 구현**

`apps-script/Code.gs`:

```js
/**
 * 퇴임 선물 참여 조사 — 서버
 *
 * 이 파일이 정본이다. Apps Script 편집기에는 이 내용을 붙여넣어 쓴다.
 * 편집기에서 직접 고쳤다면 반드시 이 파일에도 되돌려 넣을 것.
 */

var SHEET_RESPONSES = 'responses';
var SHEET_LOG = 'log';
var NCOLS = 12;

/** responses 시트의 1-based 열 번호 */
var COL = {
  EMPNO: 1, NAME: 2, PICK_A: 3, PICK_B: 4, PW_HASH: 5, SALT: 6,
  CREATED: 7, UPDATED: 8, UPDATED_BY: 9, STATUS: 10, FAIL: 11, LOCKED: 12,
};

var MAX_FAIL = 5;
var LOCK_MINUTES = 10;
var LOCK_WAIT_MS = 30000;

/** 테스트가 교체할 수 있도록 시각 취득을 한 곳으로 모은다. */
function now_() {
  return new Date();
}

function ok_(data) {
  return { ok: true, data: data };
}

function err_(code, message, extra) {
  var out = { ok: false, error: code, message: message };
  if (extra) {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
    }
  }
  return out;
}

function sheet_(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}

/** ===================== 진입점 ===================== */

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (parseErr) {
    req = null;
  }
  return ContentService
    .createTextOutput(JSON.stringify(handleRequest_(req)))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  // JSONP 경로. fetch 가 사내망에서 막혔을 때만 쓰인다.
  var req = null;
  try {
    req = JSON.parse(e.parameter.payload);
  } catch (parseErr) {
    req = null;
  }
  var body = JSON.stringify(handleRequest_(req));
  var cb = String(e.parameter.callback || '').replace(/[^A-Za-z0-9_$]/g, '');
  if (!cb) {
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(cb + '(' + body + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function handleRequest_(req) {
  try {
    if (!req || typeof req !== 'object') {
      return err_('SERVER_ERROR', '요청을 이해할 수 없습니다.');
    }
    switch (req.action) {
      case 'ping': return handlePing_();
      default: return err_('SERVER_ERROR', '알 수 없는 요청입니다.');
    }
  } catch (e) {
    return err_('SERVER_ERROR', '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
}

/** ===================== 진단 ===================== */

function handlePing_() {
  var sheetOk = false;
  try {
    sheetOk = !!sheet_(SHEET_RESPONSES);
  } catch (e) {
    sheetOk = false;
  }
  return ok_({ pong: true, sheetOk: sheetOk, at: now_().toISOString() });
}
```

`doGet`에서 콜백 이름을 `[^A-Za-z0-9_$]` 로 걸러내는 것이 중요하다. 이걸 빼면 JSONP 응답에 임의 문자열을 끼워넣을 수 있다.

- [ ] **Step 7: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 3 tests

- [ ] **Step 8: 커밋**

```bash
git add package.json apps-script/Code.gs test/
git commit -m "feat: Apps Script 로컬 테스트 하네스와 ping 엔드포인트"
```

---

## Task 2: 전송 계층 (`api.js`)

사내망 프록시의 거동을 모르므로 fetch 실패 시 JSONP로 자동 전환한다. 브라우저 없이 테스트할 수 있도록 두 전송 방식을 **주입**받는다.

**Files:**
- Create: `assets/api.js`
- Test: `test/api.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `createApi({ execUrl, fetchImpl, jsonpImpl, onTransportChange? }) → { send(payload), transport(), reset() }`
  - `send(payload)` 는 서버 응답 객체(`{ok:...}`)를 resolve 한다. 두 전송이 모두 실패하면 `{ok:false, error:'NETWORK', message:...}` 를 **reject 하지 않고 resolve** 한다
  - `TRANSPORT = { FETCH:'fetch', JSONP:'jsonp' }`
  - `browserJsonp(execUrl, payload, opts?)` — 브라우저 전용 기본 JSONP 구현

- [ ] **Step 1: 실패하는 테스트 작성**

`test/api.test.mjs`:

```js
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
```

마지막 케이스가 중요하다. 사내망 프록시는 차단할 때 **HTTP 200에 로그인 안내 HTML**을 돌려주는 일이 흔하다. 상태코드만 보면 성공으로 오인한다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../assets/api.js'`

- [ ] **Step 3: `assets/api.js` 구현**

```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 10 tests (ping 3 + api 7)

- [ ] **Step 5: 커밋**

```bash
git add assets/api.js test/api.test.mjs
git commit -m "feat: fetch↔JSONP 자동 전환 전송 계층"
```

---

## Task 3: 진단 페이지와 배포 문서 — ★ 사내망 테스트 가능 지점

이 태스크가 끝나면 **회사에서 0단계를 실행할 수 있다.** 이후 태스크는 진단 결과를 기다리지 않고 병행한다.

**Files:**
- Create: `assets/config.js`
- Create: `assets/style.css`
- Create: `test.html`
- Create: `robots.txt`
- Create: `README.md`

**Interfaces:**
- Consumes: `createApi`, `browserJsonp`, `TRANSPORT` (Task 2)
- Produces: `EXEC_URL`, `RETIREES` — 이후 모든 화면이 `config.js`에서 읽는다
  - `RETIREES = [{ key:'A', label:string }, { key:'B', label:string }]`

- [ ] **Step 1: `assets/config.js` 작성**

```js
/**
 * 운영 중 고칠 값은 전부 여기에만 둔다.
 *
 * EXEC_URL: Apps Script 배포 → 웹앱 URL. 반드시 /exec 로 끝나야 한다.
 *           /dev 로 끝나는 주소는 구글 로그인을 요구하므로 쓰면 안 된다.
 */
export const EXEC_URL = 'PASTE_YOUR_EXEC_URL_HERE';

/** key 는 시트의 pickA/pickB 와 대응한다. 순서를 바꾸면 집계가 어긋난다. */
export const RETIREES = [
  { key: 'A', label: '김OO 책임님' },
  { key: 'B', label: '이OO 책임님' },
];

export const ORG_LABEL = '네트워크연구본부';
```

`PASTE_YOUR_EXEC_URL_HERE`는 배포 시 채우는 값이며, README 1단계에 절차가 있다. 이것은 플레이스홀더가 아니라 **의도된 설정 슬롯**이다.

- [ ] **Step 2: `robots.txt` 작성**

```
User-agent: *
Disallow: /
```

- [ ] **Step 3: `assets/style.css` 작성**

```css
:root {
  --bg: #f6f7f9;
  --card: #ffffff;
  --line: #e3e6ea;
  --text: #1c2024;
  --muted: #6b7280;
  --accent: #2563eb;
  --ok: #15803d;
  --bad: #b91c1c;
  --radius: 12px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 24px 16px 64px;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Malgun Gothic", "맑은 고딕",
               "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  line-height: 1.65;
  -webkit-text-size-adjust: 100%;
}

.wrap { max-width: 560px; margin: 0 auto; }
.wide { max-width: 1040px; }

.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 24px;
  margin-bottom: 16px;
}

h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 24px 0 8px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 20px; }
.muted { color: var(--muted); font-size: 13px; }

label { display: block; font-size: 14px; font-weight: 600; margin: 16px 0 6px; }

input[type="text"], input[type="password"], input[type="tel"] {
  width: 100%;
  padding: 12px 14px;
  font-size: 16px;              /* 16px 미만이면 iOS 가 확대한다 */
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
}
input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

.hint { font-size: 13px; color: var(--muted); margin-top: 6px; min-height: 20px; }
.hint.ok { color: var(--ok); }
.hint.bad { color: var(--bad); }

button {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  font-weight: 700;
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  margin-top: 24px;
}
button:disabled { opacity: .5; cursor: default; }
button.ghost { background: #eef0f3; color: var(--text); }

.row-btns { display: flex; gap: 8px; }
.row-btns button { flex: 1; }

.err {
  background: #fef2f2; border: 1px solid #fecaca; color: var(--bad);
  padding: 12px 14px; border-radius: 8px; font-size: 14px; margin-top: 16px;
}

.pick {
  display: flex; align-items: center; gap: 14px;
  padding: 18px 16px; border: 1px solid var(--line); border-radius: 10px;
  margin-bottom: 10px; cursor: pointer; background: #fff;
}
.pick:hover { border-color: var(--accent); }
.pick input { width: 22px; height: 22px; margin: 0; flex: none; }
.pick span { font-size: 16px; font-weight: 600; }

table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: left; }
th { color: var(--muted); font-weight: 600; font-size: 13px; }
.scroll { overflow-x: auto; }

.stat-row { display: flex; flex-wrap: wrap; gap: 12px; }
.stat { flex: 1 1 120px; background: #fff; border: 1px solid var(--line);
        border-radius: 10px; padding: 14px; }
.stat b { display: block; font-size: 26px; line-height: 1.2; }
.stat span { font-size: 13px; color: var(--muted); }

.warn { background: #fffbeb; border: 1px solid #fde68a; padding: 12px 14px;
        border-radius: 8px; font-size: 14px; margin-bottom: 12px; }

pre { background: #0f172a; color: #e2e8f0; padding: 14px; border-radius: 8px;
      overflow-x: auto; font-size: 12px; line-height: 1.5; }
[hidden] { display: none !important; }
```

- [ ] **Step 4: `test.html` 작성**

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>연결 진단</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>연결 진단</h1>
    <p class="sub">사내망에서 어느 통신 경로가 열리는지 확인합니다.</p>
    <div id="results"></div>
    <button id="run">다시 검사</button>
    <button id="copy" class="ghost">결과 전체 복사</button>
    <p class="muted" id="copied" hidden>복사했습니다. 담당자에게 붙여넣어 주세요.</p>
  </div>
</div>

<script type="module">
import { EXEC_URL } from './assets/config.js';
import { browserJsonp } from './assets/api.js';

const results = document.getElementById('results');
const lines = [];

function show(name, okFlag, detail) {
  lines.push(`${okFlag ? 'OK  ' : 'FAIL'} | ${name} | ${detail}`);
  const div = document.createElement('div');
  div.className = 'hint ' + (okFlag ? 'ok' : 'bad');
  div.textContent = `${okFlag ? '✓' : '✗'} ${name} — ${detail}`;
  results.appendChild(div);
}

async function timed(fn) {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { okFlag: true, ms: Math.round(performance.now() - t0), value };
  } catch (e) {
    return { okFlag: false, ms: Math.round(performance.now() - t0), error: e };
  }
}

async function run() {
  results.innerHTML = '';
  lines.length = 0;
  lines.push('시각: ' + new Date().toISOString());
  lines.push('UA: ' + navigator.userAgent);
  lines.push('EXEC_URL: ' + EXEC_URL);
  lines.push('');

  if (!EXEC_URL || EXEC_URL.indexOf('PASTE_') === 0) {
    show('설정', false, 'assets/config.js 의 EXEC_URL 이 아직 비어 있습니다');
    return;
  }
  if (!/\/exec$/.test(EXEC_URL)) {
    show('설정', false, 'EXEC_URL 이 /exec 로 끝나지 않습니다 (/dev 주소는 쓸 수 없습니다)');
    return;
  }

  const a = await timed(async () => {
    const res = await fetch(EXEC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'ping' }),
      redirect: 'follow',
    });
    const text = await res.text();
    return { status: res.status, finalUrl: res.url, body: text.slice(0, 200) };
  });
  show('① fetch POST (text/plain)', a.okFlag && a.value.status === 200,
       a.okFlag ? `${a.ms}ms · HTTP ${a.value.status} · ${a.value.body}` : `${a.ms}ms · ${a.error.message}`);
  if (a.okFlag) lines.push('    최종 URL: ' + a.value.finalUrl);

  const b = await timed(() => browserJsonp(EXEC_URL, { action: 'ping' }, { timeoutMs: 15000 }));
  show('② JSONP GET', b.okFlag && b.value && b.value.ok === true,
       b.okFlag ? `${b.ms}ms · ${JSON.stringify(b.value)}` : `${b.ms}ms · ${b.error.message}`);

  const c = await timed(() => new Promise((resolve, reject) => {
    const img = new Image();
    const t = setTimeout(() => reject(new Error('시간 초과')), 8000);
    img.onload = img.onerror = () => { clearTimeout(t); resolve(true); };
    img.src = 'https://script.googleusercontent.com/favicon.ico?_=' + Date.now();
  }));
  show('③ script.googleusercontent.com 도달', c.okFlag,
       c.okFlag ? `${c.ms}ms` : `${c.ms}ms · ${c.error.message}`);

  const sheetOk = (a.okFlag && /"sheetOk":true/.test(a.value.body))
               || (b.okFlag && b.value && b.value.data && b.value.data.sheetOk === true);
  show('④ 시트 접근', !!sheetOk, sheetOk ? '서버가 시트를 읽었습니다' : '확인 실패');

  const verdict = a.okFlag && a.value.status === 200
    ? '판정: ① fetch 경로로 정상 동작 가능'
    : (b.okFlag ? '판정: ①은 막힘 → ② JSONP 경로로 동작 가능'
                : '판정: ①② 모두 실패 — 화면을 Apps Script 로 옮기는 3차 안이 필요');
  lines.push('', verdict);
  const p = document.createElement('p');
  p.style.fontWeight = '700';
  p.style.marginTop = '16px';
  p.textContent = verdict;
  results.appendChild(p);
}

document.getElementById('run').addEventListener('click', run);
document.getElementById('copy').addEventListener('click', async () => {
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  document.getElementById('copied').hidden = false;
});

run();
</script>
</body>
</html>
```

③번은 `fetch` 대신 `Image`를 쓴다. 이미지 로드는 CORS를 타지 않아 **도메인 도달 자체**만 순수하게 잴 수 있다.

- [ ] **Step 5: `README.md` 작성**

````markdown
# 퇴임 선물 참여 조사

[설계 문서](docs/superpowers/specs/2026-08-12-farewell-gift-survey-design.md) · [구현 계획](docs/superpowers/plans/2026-08-12-farewell-gift-survey.md)

## ⚠️ 개인정보

이 저장소는 GitHub Pages 때문에 **공개**다. 실명·사번·연락처가 담긴 파일을
커밋하지 않는다. `명단.md` 등은 `.gitignore`에 등록되어 있다.
명단이 필요하면 관리자 개인 드라이브의 **비공개 구글시트**에만 둔다.

## 배포 순서

### 1. 구글시트 (개인 gmail 계정으로)

회사 워크스페이스 계정은 「액세스: 모든 사용자」 배포가 정책으로 막힌 경우가 많다.
반드시 개인 계정을 쓴다.

1. 새 스프레드시트를 만든다
2. 시트 이름을 `responses` 로 바꾸고, 시트를 하나 더 추가해 `log` 로 이름 짓는다
3. `responses` 1행에 헤더를 넣는다:
   `empNo  name  pickA  pickB  pwHash  salt  createdAt  updatedAt  updatedBy  status  failCount  lockedUntil`
4. `log` 1행에 헤더를 넣는다: `at  action  empNo  actor  detail`
5. **`responses` A열 전체를 선택 → 서식 → 숫자 → 일반 텍스트**
   (이걸 빼면 사번 `01234` 가 `1234` 로 바뀐다)

### 2. Apps Script

1. 확장 프로그램 → Apps Script
2. **프로젝트 설정 → 「Chrome V8 런타임 사용」이 켜져 있는지 확인한다.**
   구형 Rhino 런타임에서는 `String.prototype.normalize` 가 없어 이름 정규화가 죽는다
3. `apps-script/Code.gs` 내용을 전부 붙여넣는다
4. 함수 목록에서 `setupAdminPassword` 를 고르고, 코드 안의 `'CHANGE_ME'` 를
   실제 관리자 비밀번호로 바꾼 뒤 **한 번 실행**한다 (권한 승인 필요)
5. 실행이 끝나면 코드의 비밀번호를 다시 `'CHANGE_ME'` 로 되돌리고 저장한다
6. 배포 → 새 배포 → 유형: **웹 앱**
   - 설명: 아무거나
   - 실행: **나**
   - 액세스 권한: **모든 사용자**
7. 배포 후 나오는 **웹 앱 URL**을 복사한다 (`/exec` 로 끝나야 한다)

> 코드를 고칠 때마다 **배포 → 배포 관리 → 편집 → 버전: 새 버전** 을 해야 반영된다.
> 저장만 해서는 `/exec` 주소의 내용이 바뀌지 않는다.

### 3. GitHub Pages

1. GitHub에 저장소를 만들고 push 한다
2. Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `(root)`
3. 몇 분 뒤 `https://<계정>.github.io/<저장소>/` 로 열린다

### 4. 연결

1. `assets/config.js` 의 `EXEC_URL` 에 2-7에서 복사한 주소를 넣는다
2. `RETIREES` 의 `label` 두 개를 실제 표기로 고친다
3. commit & push
4. **사내망 PC**에서 `https://<계정>.github.io/<저장소>/test.html` 을 연다
5. `[결과 전체 복사]` 를 눌러 진단 결과를 담당자에게 전달한다

## 로컬 개발

```bash
npm test          # 단위 테스트 (node 18+)
npm run serve     # http://localhost:8080 — ES 모듈은 file:// 로 못 여니 서버가 필요하다
```

## 행사 종료 후

1. 구글시트에서 필요한 집계를 내려받는다
2. 구글시트와 Apps Script 프로젝트를 **삭제**한다
3. Apps Script 배포를 보관 처리한다
4. GitHub 저장소를 삭제하거나 Pages 를 끈다
````

- [ ] **Step 6: 테스트가 여전히 통과하는지 확인**

Run: `npm test`
Expected: PASS — 10 tests (이 태스크는 테스트 대상 코드를 바꾸지 않았다)

- [ ] **Step 7: 진단 페이지가 브라우저에서 뜨는지 확인**

Run: `npm run serve` 후 브라우저에서 `http://localhost:8080/test.html`
Expected: 「설정 — `assets/config.js` 의 `EXEC_URL` 이 아직 비어 있습니다」가 빨간 글씨로 표시된다.
(아직 `EXEC_URL`을 안 넣었으므로 이게 정상이다. 콘솔에 모듈 로드 오류가 없어야 한다.)

- [ ] **Step 8: 커밋**

```bash
git add assets/config.js assets/style.css test.html robots.txt README.md
git commit -m "feat: 사내망 연결 진단 페이지와 배포 문서"
```

---

## Task 4: 정규화 — 브라우저와 서버 두 벌, 케이스 표 하나

**Files:**
- Create: `assets/normalize.js`
- Create: `test/cases/normalize-cases.mjs`
- Modify: `apps-script/Code.gs` (정규화 함수 추가)
- Test: `test/normalize.test.mjs`

**Interfaces:**
- Consumes: `loadServer` (Task 1)
- Produces:
  - 브라우저: `normalizeEmpNo(raw) → string|null`, `normalizeName(raw) → string|null`, `normalizePw(raw) → string|null`
  - 서버: 같은 이름에 `_` 접미사 — `normalizeEmpNo_`, `normalizeName_`, `normalizePw_`
  - `EMPNO_CASES`, `NAME_CASES`, `PW_CASES` — `{ input, expected, why }[]`

- [ ] **Step 1: 공용 케이스 표 작성**

`test/cases/normalize-cases.mjs`:

```js
// 브라우저 구현과 서버 구현을 모두 이 표로 검증한다.
// 규칙이 바뀌면 여기부터 고친다.

export const EMPNO_CASES = [
  { input: '01234', expected: '01234', why: '그대로' },
  { input: '1234',  expected: '01234', why: '앞의 0을 빼고 입력 — 실제 명단 대부분이 0으로 시작한다' },
  { input: '123',   expected: '00123', why: '0 두 개 생략' },
  { input: '1',     expected: '00001', why: '한 자리' },
  { input: '1 2 3 4', expected: '01234', why: '띄어쓰기' },
  { input: '1-234', expected: '01234', why: '하이픈' },
  { input: ' 01111 ', expected: '01111', why: '앞뒤 공백' },
  { input: '１２３', expected: '00123', why: '전각 숫자' },
  { input: '99999', expected: '99999', why: '0으로 시작하지 않는 사번도 있다' },
  { input: '88888', expected: '88888', why: '연수생 사번' },
  { input: '123456', expected: null,   why: '6자리는 오류' },
  { input: '',      expected: null,    why: '빈 값' },
  { input: '   ',   expected: null,    why: '공백뿐' },
  { input: 'abcde', expected: null,    why: '숫자가 하나도 없음' },
  { input: null,    expected: null,    why: 'null' },
  { input: undefined, expected: null,  why: 'undefined' },
];

export const NAME_CASES = [
  { input: '홍길동',    expected: '홍길동', why: '그대로' },
  { input: '홍 길동',   expected: '홍길동', why: '가운데 공백' },
  { input: '  홍길동 ', expected: '홍길동', why: '앞뒤 공백' },
  { input: '홍　길동',  expected: '홍길동', why: '전각 공백' },
  { input: '카림 유수프', expected: '카림유수프', why: '외국인 이름 — 띄어쓰기가 사람마다 갈린다' },
  { input: '응우옌 티린', expected: '응우옌티린', why: '외국인 이름' },
  { input: 'Kim Kitae', expected: 'KimKitae', why: '영문 표기' },
  { input: '홍길동\t',  expected: '홍길동', why: '탭' },
  { input: '',          expected: null,    why: '빈 값' },
  { input: '   ',       expected: null,    why: '공백뿐' },
  { input: '가'.repeat(21), expected: null, why: '20자 초과' },
  { input: '가'.repeat(20), expected: '가'.repeat(20), why: '경계값 20자는 통과' },
  { input: null,        expected: null,    why: 'null' },
];

export const PW_CASES = [
  { input: '1234',  expected: '1234', why: '그대로' },
  { input: '0000',  expected: '0000', why: '앞자리 0 유지 — 채우지 않고 그대로 둔다' },
  { input: ' 1234 ', expected: '1234', why: '앞뒤 공백' },
  { input: '１２３４', expected: '1234', why: '전각 숫자' },
  { input: '123',   expected: null,   why: '3자리' },
  { input: '12345', expected: null,   why: '5자리' },
  { input: 'abcd',  expected: null,   why: '숫자 아님' },
  { input: '12a4',  expected: null,   why: '일부만 숫자' },
  { input: '',      expected: null,   why: '빈 값' },
  { input: null,    expected: null,   why: 'null' },
];
```

**주의:** 비밀번호는 사번과 달리 **앞에 0을 채우지 않는다.** `123`은 `0123`이 아니라 오류다. 비밀번호는 사용자가 정한 값이라 임의로 바꾸면 안 된다.

- [ ] **Step 2: 실패하는 테스트 작성**

`test/normalize.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmpNo, normalizeName, normalizePw } from '../assets/normalize.js';
import { loadServer } from './harness/load-code-gs.mjs';
import { EMPNO_CASES, NAME_CASES, PW_CASES } from './cases/normalize-cases.mjs';

const server = loadServer().fn;

const IMPLS = [
  { label: '브라우저', empNo: normalizeEmpNo, name: normalizeName, pw: normalizePw },
  { label: '서버',     empNo: server.normalizeEmpNo_, name: server.normalizeName_, pw: server.normalizePw_ },
];

for (const impl of IMPLS) {
  test(`[${impl.label}] 사번 정규화`, () => {
    for (const c of EMPNO_CASES) {
      assert.equal(impl.empNo(c.input), c.expected, `${JSON.stringify(c.input)} — ${c.why}`);
    }
  });

  test(`[${impl.label}] 이름 정규화`, () => {
    for (const c of NAME_CASES) {
      assert.equal(impl.name(c.input), c.expected, `${JSON.stringify(c.input)} — ${c.why}`);
    }
  });

  test(`[${impl.label}] 비밀번호 정규화`, () => {
    for (const c of PW_CASES) {
      assert.equal(impl.pw(c.input), c.expected, `${JSON.stringify(c.input)} — ${c.why}`);
    }
  });
}

test('조합형 한글은 NFC 로 모여 완성형과 같아진다', () => {
  const nfd = '홍길동'.normalize('NFD');
  assert.notEqual(nfd, '홍길동', '전제: NFD 는 원문과 다른 문자열이다');
  for (const impl of IMPLS) {
    assert.equal(impl.name(nfd), '홍길동', impl.label);
  }
});

test('두 구현이 같은 입력에 같은 답을 낸다', () => {
  const inputs = ['1234', '01234', '１２３', 'abc', '', '999999', ' 7 ', '99999'];
  for (const raw of inputs) {
    assert.equal(normalizeEmpNo(raw), server.normalizeEmpNo_(raw), `사번 ${JSON.stringify(raw)}`);
    assert.equal(normalizeName(raw), server.normalizeName_(raw), `이름 ${JSON.stringify(raw)}`);
    assert.equal(normalizePw(raw), server.normalizePw_(raw), `비번 ${JSON.stringify(raw)}`);
  }
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../assets/normalize.js'`

- [ ] **Step 4: 브라우저 구현 작성**

`assets/normalize.js`:

```js
/**
 * 사번·이름·비밀번호 정규화.
 *
 * 같은 규칙이 apps-script/Code.gs 에도 있다. 한쪽만 고치면 안 된다.
 * test/cases/normalize-cases.mjs 가 두 구현을 함께 검증한다.
 */

const FULLWIDTH_DIGITS = /[０-９]/g;
const NON_DIGIT = /[^0-9]/g;
// \s 는 U+3000 도 포함하지만, 제로폭 문자는 따로 지워야 한다.
const WHITESPACE = /[\s　​-‍﻿]/g;

export const EMPNO_LENGTH = 5;
export const PW_LENGTH = 4;
export const NAME_MAX = 20;

function toHalfWidthDigits(s) {
  return s.replace(FULLWIDTH_DIGITS, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
}

/** '1234' → '01234'. 숫자만 남기고 5자리가 될 때까지 앞에 0을 채운다. */
export function normalizeEmpNo(raw) {
  if (raw === null || raw === undefined) return null;
  const digits = toHalfWidthDigits(String(raw)).replace(NON_DIGIT, '');
  if (digits.length === 0 || digits.length > EMPNO_LENGTH) return null;
  return digits.padStart(EMPNO_LENGTH, '0');
}

/** '홍 길동' → '홍길동'. 공백을 모두 지우고 NFC 로 모은다. */
export function normalizeName(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).normalize('NFC').replace(WHITESPACE, '');
  if (cleaned.length === 0 || cleaned.length > NAME_MAX) return null;
  return cleaned;
}

/** 숫자 4자리만 허용. 사번과 달리 0을 채우지 않는다. */
export function normalizePw(raw) {
  if (raw === null || raw === undefined) return null;
  const s = toHalfWidthDigits(String(raw)).replace(WHITESPACE, '');
  if (!/^[0-9]{4}$/.test(s)) return null;
  return s;
}
```

- [ ] **Step 5: 서버 구현 추가**

`apps-script/Code.gs` 의 `now_()` 정의 **바로 아래**에 삽입한다:

```js
/** ===================== 정규화 =====================
 * assets/normalize.js 와 같은 규칙이다. 한쪽만 고치면 안 된다.
 */

var EMPNO_LENGTH = 5;
var PW_LENGTH = 4;
var NAME_MAX = 20;

var WS_RE_ = /[\s　​-‍﻿]/g;

function toHalfWidthDigits_(s) {
  return s.replace(/[０-９]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30);
  });
}

function normalizeEmpNo_(raw) {
  if (raw === null || raw === undefined) return null;
  var digits = toHalfWidthDigits_(String(raw)).replace(/[^0-9]/g, '');
  if (digits.length === 0 || digits.length > EMPNO_LENGTH) return null;
  while (digits.length < EMPNO_LENGTH) digits = '0' + digits;   // padStart 는 쓰지 않는다
  return digits;
}

function normalizeName_(raw) {
  if (raw === null || raw === undefined) return null;
  var cleaned = String(raw).normalize('NFC').replace(WS_RE_, '');
  if (cleaned.length === 0 || cleaned.length > NAME_MAX) return null;
  return cleaned;
}

function normalizePw_(raw) {
  if (raw === null || raw === undefined) return null;
  var s = toHalfWidthDigits_(String(raw)).replace(WS_RE_, '');
  if (!/^[0-9]{4}$/.test(s)) return null;
  return s;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 18 tests (ping 3 + api 7 + normalize 8)

- [ ] **Step 7: 커밋**

```bash
git add assets/normalize.js apps-script/Code.gs test/cases/ test/normalize.test.mjs
git commit -m "feat: 사번·이름·비밀번호 정규화 (브라우저/서버 공용 케이스 검증)"
```

---

## Task 5: 시트 저장소 계층

**Files:**
- Modify: `apps-script/Code.gs`
- Test: `test/repo.test.mjs`

**Interfaces:**
- Consumes: `COL`, `NCOLS`, `now_` (Task 1)
- Produces:
  - `readRows_() → [{ rowIndex, empNo, name, pickA, pickB, pwHash, salt, createdAt, updatedAt, updatedBy, status, failCount, lockedUntil }]` — `rowIndex`는 시트의 1-based 행 번호
  - `findByEmpNo_(rows, empNo) → row|null` — `status='active'` 인 것만
  - `findAnyByEmpNo_(rows, empNo) → row[]` — 삭제분 포함
  - `writeRow_(row)` — `rowIndex` 위치에 12칸을 통째로 덮어쓴다
  - `appendRow_(row) → row` — 새 행 추가 후 `rowIndex` 채워 반환
  - `blankRow_(empNo, name) → row` — 기본값이 채워진 새 row 객체
  - `writeLog_(action, empNo, actor, detail)`
  - `withLock_(fn)` — 락을 잡고 `fn()` 실행. 실패 시 `BUSY` 반환
  - `sha256Base64_(s)`, `newSalt_()`, `hashPw_(salt, pw)`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/repo.test.mjs`:

```js
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
  assert.deepEqual(s.fn.readRows_(), []);
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `s.fn.readRows_ is not a function`

- [ ] **Step 3: 저장소 계층 구현**

`apps-script/Code.gs` 의 정규화 블록 아래에 삽입한다:

```js
/** ===================== 저장소 ===================== */

function boolOf_(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1;
}

function rowFromValues_(values, rowIndex) {
  return {
    rowIndex: rowIndex,
    empNo: normalizeEmpNo_(values[COL.EMPNO - 1]) || String(values[COL.EMPNO - 1] || ''),
    name: String(values[COL.NAME - 1] || ''),
    pickA: boolOf_(values[COL.PICK_A - 1]),
    pickB: boolOf_(values[COL.PICK_B - 1]),
    pwHash: String(values[COL.PW_HASH - 1] || ''),
    salt: String(values[COL.SALT - 1] || ''),
    createdAt: String(values[COL.CREATED - 1] || ''),
    updatedAt: String(values[COL.UPDATED - 1] || ''),
    updatedBy: String(values[COL.UPDATED_BY - 1] || ''),
    status: String(values[COL.STATUS - 1] || 'active'),
    failCount: Number(values[COL.FAIL - 1] || 0),
    lockedUntil: String(values[COL.LOCKED - 1] || ''),
  };
}

function valuesFromRow_(row) {
  var v = [];
  v[COL.EMPNO - 1] = row.empNo;
  v[COL.NAME - 1] = row.name;
  v[COL.PICK_A - 1] = !!row.pickA;
  v[COL.PICK_B - 1] = !!row.pickB;
  v[COL.PW_HASH - 1] = row.pwHash || '';
  v[COL.SALT - 1] = row.salt || '';
  v[COL.CREATED - 1] = row.createdAt || '';
  v[COL.UPDATED - 1] = row.updatedAt || '';
  v[COL.UPDATED_BY - 1] = row.updatedBy || '';
  v[COL.STATUS - 1] = row.status || 'active';
  v[COL.FAIL - 1] = Number(row.failCount || 0);
  v[COL.LOCKED - 1] = row.lockedUntil || '';
  return v;
}

function readRows_() {
  var sh = sheet_(SHEET_RESPONSES);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i += 1) {          // 0행은 헤더
    if (!values[i] || String(values[i][COL.EMPNO - 1] || '') === '') continue;
    out.push(rowFromValues_(values[i], i + 1));          // 시트는 1-based
  }
  return out;
}

function findByEmpNo_(rows, empNo) {
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].empNo === empNo && rows[i].status === 'active') return rows[i];
  }
  return null;
}

function findAnyByEmpNo_(rows, empNo) {
  var out = [];
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].empNo === empNo) out.push(rows[i]);
  }
  return out;
}

function blankRow_(empNo, name) {
  var iso = now_().toISOString();
  return {
    rowIndex: 0, empNo: empNo, name: name,
    pickA: false, pickB: false, pwHash: '', salt: '',
    createdAt: iso, updatedAt: iso, updatedBy: 'self',
    status: 'active', failCount: 0, lockedUntil: '',
  };
}

function appendRow_(row) {
  var sh = sheet_(SHEET_RESPONSES);
  sh.appendRow(valuesFromRow_(row));
  row.rowIndex = sh.getLastRow();
  return row;
}

function writeRow_(row) {
  var sh = sheet_(SHEET_RESPONSES);
  sh.getRange(row.rowIndex, 1, 1, NCOLS).setValues([valuesFromRow_(row)]);
  return row;
}

function writeLog_(action, empNo, actor, detail) {
  var sh = sheet_(SHEET_LOG);
  if (!sh) return;
  sh.appendRow([now_().toISOString(), action, empNo, actor, detail || '']);
}

/** 시트 읽기-수정-쓰기 사이에 다른 요청이 끼어들면 행이 덮어써진다. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return err_('BUSY', '접속이 몰리고 있습니다. 잠시 후 다시 시도해주세요.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** ===================== 해시 ===================== */

function sha256Base64_(s) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function newSalt_() {
  return Utilities.getUuid();
}

function hashPw_(salt, pw) {
  return sha256Base64_(String(salt) + '|' + String(pw));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 30 tests

- [ ] **Step 5: 커밋**

```bash
git add apps-script/Code.gs test/repo.test.mjs
git commit -m "feat: 시트 저장소 계층과 비밀번호 해시"
```

---

## Task 6: 인증 판정표와 잠금 규칙

**Files:**
- Modify: `apps-script/Code.gs`
- Test: `test/auth.test.mjs`

**Interfaces:**
- Consumes: Task 5 전부
- Produces:
  - `handleAuth_(req)` → `ok_({ mode, empNo, name, picks:{A,B}, updatedAt })`
    - `mode` ∈ `'new'` | `'existing'` | `'claim'`
  - `verifyCredentials_(rows, req) → { row, mode } | {error 응답}` — `handleSave_`가 재사용한다
  - `checkLock_(row) → null | err_('LOCKED', ...)`
  - `registerFailure_(row)`, `clearFailure_(row)`
  - `handleRequest_`에 `auth` 케이스 등록

- [ ] **Step 1: 실패하는 테스트 작성**

`test/auth.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './harness/load-code-gs.mjs';

// 해시를 직접 만들기 위해 서버 함수를 빌려 쓴다.
function rowWithPw({
  empNo = '01234', name = '홍길동', pickA = true, pickB = false,
  pw = '1234', status = 'active', failCount = 0, lockedUntil = '',
} = {}) {
  const s = loadServer();
  const salt = 'fixed-salt';
  const hash = s.fn.hashPw_(salt, pw);
  return [empNo, name, pickA, pickB, hash, salt,
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'self',
          status, failCount, lockedUntil];
}

test('처음 보는 사번은 mode=new 이고 아직 저장하지 않는다', () => {
  const s = loadServer();
  const res = s.call({ action: 'auth', empNo: '1234', name: '홍 길동', pw: '9999' });
  assert.equal(res.ok, true);
  assert.equal(res.data.mode, 'new');
  assert.equal(res.data.empNo, '01234', '정규화된 사번을 돌려줘야 확인 화면에 띄울 수 있다');
  assert.equal(res.data.name, '홍길동');
  assert.deepEqual(res.data.picks, { A: false, B: false });
  assert.equal(s.rows().length, 0, 'auth 단계에서 행을 만들면 안 된다');
});

test('사번·이름·비번이 모두 맞으면 mode=existing 과 기존 선택을 준다', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  const res = s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '1234' });
  assert.equal(res.ok, true);
  assert.equal(res.data.mode, 'existing');
  assert.deepEqual(res.data.picks, { A: true, B: false });
});

test('앞의 0을 뺀 사번으로도 같은 행에 들어간다', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  const res = s.call({ action: 'auth', empNo: '1234', name: '홍길동', pw: '1234' });
  assert.equal(res.data.mode, 'existing');
});

test('사번은 맞고 이름이 다르면 NAME_MISMATCH', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  const res = s.call({ action: 'auth', empNo: '01234', name: '홍길순', pw: '1234' });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'NAME_MISMATCH');
});

test('비밀번호가 틀리면 WRONG_PW 와 남은 횟수', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  const res = s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '0000' });
  assert.equal(res.error, 'WRONG_PW');
  assert.equal(res.remaining, 4);
  assert.equal(s.rows()[0][10], 1, 'failCount 가 올라야 한다');
});

test('5회 틀리면 잠기고 잠금 중에는 카운터가 더 오르지 않는다', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  for (let i = 0; i < 5; i += 1) s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '0000' });

  assert.equal(s.rows()[0][10], 5);
  assert.equal(s.rows()[0][11], '2026-08-12T09:10:00.000Z', '10분 뒤로 잠금');

  const res = s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '0000' });
  assert.equal(res.error, 'LOCKED');
  assert.equal(s.rows()[0][10], 5, '잠금 중엔 카운터를 올리지 않는다');
});

test('잠금 중에는 올바른 비밀번호도 거부한다', () => {
  const s = loadServer({ responses: [rowWithPw({ failCount: 5, lockedUntil: '2026-08-12T09:05:00.000Z' })] });
  const res = s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '1234' });
  assert.equal(res.error, 'LOCKED');
});

test('잠금이 풀리면 카운터가 0으로 돌아가고 정상 판정한다', () => {
  const s = loadServer({ responses: [rowWithPw({ failCount: 5, lockedUntil: '2026-08-12T09:05:00.000Z' })] });
  s.setNow('2026-08-12T09:06:00.000Z');
  const res = s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '1234' });
  assert.equal(res.ok, true);
  assert.equal(res.data.mode, 'existing');
  assert.equal(s.rows()[0][10], 0);
  assert.equal(s.rows()[0][11], '');
});

test('성공하면 failCount 가 0으로 초기화된다', () => {
  const s = loadServer({ responses: [rowWithPw({ failCount: 3 })] });
  s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '1234' });
  assert.equal(s.rows()[0][10], 0);
});

test('관리자 대리 입력 행(비번 없음)은 mode=claim 이고 비번을 묻지 않는다', () => {
  const s = loadServer({
    responses: [['01234', '홍길동', true, true, '', '',
                 '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'admin', 'active', 0, '']],
  });
  const res = s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '5555' });
  assert.equal(res.ok, true);
  assert.equal(res.data.mode, 'claim');
  assert.deepEqual(res.data.picks, { A: true, B: true }, '관리자가 넣어준 선택을 보여준다');
  assert.equal(s.rows()[0][4], '', 'auth 만으로 비번을 설정하면 안 된다 — save 에서 한다');
});

test('삭제된 행은 없는 것으로 보아 mode=new', () => {
  const s = loadServer({ responses: [rowWithPw({ status: 'deleted' })] });
  const res = s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '1234' });
  assert.equal(res.data.mode, 'new');
});

test('입력 형식 오류는 시트를 건드리기 전에 걸러낸다', () => {
  const s = loadServer();
  assert.equal(s.call({ action: 'auth', empNo: '123456', name: '홍길동', pw: '1234' }).error, 'BAD_EMPNO');
  assert.equal(s.call({ action: 'auth', empNo: '01234', name: '  ', pw: '1234' }).error, 'BAD_NAME');
  assert.equal(s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '12' }).error, 'BAD_PW');
  assert.equal(s.rows().length, 0);
});

test('오류 응답에 pwHash 나 salt 가 새지 않는다', () => {
  const s = loadServer({ responses: [rowWithPw()] });
  const res = s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '0000' });
  const json = JSON.stringify(res);
  assert.equal(json.includes('fixed-salt'), false);
  assert.equal(/pwHash/.test(json), false);
});

test('auth 도 락을 못 잡으면 BUSY — failCount 를 쓰기 때문이다', () => {
  const s = loadServer({ responses: [rowWithPw()], lockFails: true });
  const res = s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '0000' });
  assert.equal(res.error, 'BUSY');
  assert.equal(s.rows()[0][10], 0, 'failCount 가 오르면 안 된다');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `auth` 가 `SERVER_ERROR`로 떨어진다

- [ ] **Step 3: 인증 구현**

`apps-script/Code.gs` 의 해시 블록 아래에 삽입한다:

```js
/** ===================== 인증 ===================== */

function checkLock_(row) {
  if (!row.lockedUntil) return null;
  var until = new Date(row.lockedUntil);
  if (now_().getTime() < until.getTime()) {
    return err_('LOCKED',
      '비밀번호를 여러 번 잘못 입력해 잠겼습니다. 잠시 후 다시 시도해주세요.',
      { lockedUntil: row.lockedUntil });
  }
  // 잠금이 지났다 — 카운터를 되돌린다.
  row.failCount = 0;
  row.lockedUntil = '';
  writeRow_(row);
  return null;
}

function registerFailure_(row) {
  row.failCount = Number(row.failCount || 0) + 1;
  if (row.failCount >= MAX_FAIL) {
    row.lockedUntil = new Date(now_().getTime() + LOCK_MINUTES * 60000).toISOString();
    writeRow_(row);
    return err_('LOCKED',
      '비밀번호를 ' + MAX_FAIL + '회 잘못 입력해 ' + LOCK_MINUTES + '분간 잠겼습니다.',
      { lockedUntil: row.lockedUntil });
  }
  writeRow_(row);
  return err_('WRONG_PW', '비밀번호가 일치하지 않습니다.',
    { remaining: MAX_FAIL - row.failCount });
}

function clearFailure_(row) {
  if (Number(row.failCount || 0) !== 0 || row.lockedUntil) {
    row.failCount = 0;
    row.lockedUntil = '';
    writeRow_(row);
  }
}

/**
 * 자격 판정. 성공하면 { row, mode, empNo, name, pw }, 실패하면 오류 응답을 돌려준다.
 * 반환값에 .ok 가 있으면 오류다.
 *
 * 이 함수는 절대 스스로 락을 잡지 않는다. 호출자(handleAuth_/handleSave_)가
 * 이미 withLock_ 안에 있기 때문이며, 여기서 또 잡으면 중첩 획득이 된다.
 */
function verifyCredentials_(req) {
  var empNo = normalizeEmpNo_(req.empNo);
  if (!empNo) return err_('BAD_EMPNO', '사번은 숫자 5자리입니다. 다시 확인해주세요.');

  var name = normalizeName_(req.name);
  if (!name) return err_('BAD_NAME', '이름을 입력해주세요.');

  var pw = normalizePw_(req.pw);
  if (!pw) return err_('BAD_PW', '비밀번호는 숫자 4자리입니다.');

  var rows = readRows_();
  var row = findByEmpNo_(rows, empNo);

  if (!row) return { row: null, mode: 'new', empNo: empNo, name: name, pw: pw };

  if (row.name !== name) {
    return err_('NAME_MISMATCH', '사번과 이름이 일치하지 않습니다. 다시 확인해주세요.');
  }

  var locked = checkLock_(row);
  if (locked) return locked;

  // 관리자가 대리 입력한 행은 비밀번호가 없다. 이 사람이 지금 이어받는다.
  if (!row.pwHash) {
    return { row: row, mode: 'claim', empNo: empNo, name: name, pw: pw };
  }

  if (hashPw_(row.salt, pw) !== row.pwHash) {
    return registerFailure_(row);
  }

  clearFailure_(row);
  return { row: row, mode: 'existing', empNo: empNo, name: name, pw: pw };
}

/**
 * auth 는 읽기처럼 보이지만 failCount 를 쓴다.
 * 락이 없으면 동시에 들어온 두 번의 오입력이 둘 다 3을 읽고 4를 써서
 * 5회 잠금이 영영 걸리지 않는다. 그래서 save 와 똑같이 감싼다.
 */
function handleAuth_(req) {
  return withLock_(function () {
    var v = verifyCredentials_(req);
    if (v.ok === false) return v;

    return ok_({
      mode: v.mode,
      empNo: v.empNo,
      name: v.name,
      picks: {
        A: v.row ? !!v.row.pickA : false,
        B: v.row ? !!v.row.pickB : false,
      },
      updatedAt: v.row ? v.row.updatedAt : '',
    });
  });
}
```

`handleRequest_`의 `switch`에 한 줄 추가한다:

```js
      case 'auth': return handleAuth_(req);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 44 tests

- [ ] **Step 5: 커밋**

```bash
git add apps-script/Code.gs test/auth.test.mjs
git commit -m "feat: 인증 판정표와 5회 실패 10분 잠금"
```

---

## Task 7: 선택 저장 (`save`)

**Files:**
- Modify: `apps-script/Code.gs`
- Test: `test/save.test.mjs`

**Interfaces:**
- Consumes: `verifyCredentials_`, `withLock_`, `appendRow_`, `writeRow_`, `writeLog_`
- Produces: `handleSave_(req)` → `ok_({ picks:{A,B}, updatedAt })`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/save.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './harness/load-code-gs.mjs';

function withPw(over = {}) {
  const s = loadServer();
  const salt = 'fixed-salt';
  return ['01234', '홍길동', false, false, s.fn.hashPw_(salt, '1234'), salt,
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'self',
          over.status || 'active', 0, ''];
}

test('신규 저장은 행을 만들고 비밀번호를 해시로 넣는다', () => {
  const s = loadServer();
  const res = s.call({ action: 'save', empNo: '1234', name: '홍 길동', pw: '9999', pickA: true, pickB: false });

  assert.equal(res.ok, true);
  assert.deepEqual(res.data.picks, { A: true, B: false });

  const row = s.rows()[0];
  assert.equal(row[0], '01234');
  assert.equal(row[1], '홍길동');
  assert.equal(row[2], true);
  assert.equal(row[3], false);
  assert.notEqual(row[4], '', 'pwHash 가 있어야 한다');
  assert.notEqual(row[4], '9999', '원문을 저장하면 안 된다');
  assert.equal(row[8], 'self');
  assert.equal(row[9], 'active');
});

test('둘 다 체크하지 않은 제출도 정상 저장된다', () => {
  const s = loadServer();
  const res = s.call({ action: 'save', empNo: '01234', name: '홍길동', pw: '1234', pickA: false, pickB: false });
  assert.equal(res.ok, true);
  assert.equal(s.rows().length, 1, '불참도 하나의 응답이다');
  assert.equal(s.rows()[0][2], false);
  assert.equal(s.rows()[0][3], false);
});

test('재저장은 행을 늘리지 않고 갱신하며 createdAt 을 보존한다', () => {
  const s = loadServer({ responses: [withPw()] });
  s.setNow('2026-08-13T01:02:03.000Z');
  const res = s.call({ action: 'save', empNo: '01234', name: '홍길동', pw: '1234', pickA: true, pickB: true });

  assert.equal(res.ok, true);
  assert.equal(s.rows().length, 1);
  assert.equal(s.rows()[0][6], '2026-08-01T00:00:00.000Z', 'createdAt 은 그대로');
  assert.equal(s.rows()[0][7], '2026-08-13T01:02:03.000Z', 'updatedAt 은 갱신');
});

test('앞의 0을 뺀 사번으로 저장해도 같은 행을 고친다', () => {
  const s = loadServer({ responses: [withPw()] });
  s.call({ action: 'save', empNo: '1234', name: '홍길동', pw: '1234', pickA: true, pickB: false });
  assert.equal(s.rows().length, 1, '중복 행이 생기면 안 된다');
});

test('관리자 대리 입력 행에 본인이 처음 저장하면 비밀번호가 설정된다', () => {
  const s = loadServer({
    responses: [['01234', '홍길동', true, false, '', '',
                 '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'admin', 'active', 0, '']],
  });
  const res = s.call({ action: 'save', empNo: '01234', name: '홍길동', pw: '7777', pickA: false, pickB: true });

  assert.equal(res.ok, true);
  assert.notEqual(s.rows()[0][4], '', 'pwHash 설정');
  assert.notEqual(s.rows()[0][5], '', 'salt 설정');
  assert.equal(s.rows()[0][8], 'self', '이제 본인이 관리한다');

  // 설정된 비밀번호로 다시 들어갈 수 있어야 한다
  assert.equal(s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '7777' }).data.mode, 'existing');
});

test('삭제된 사번으로 다시 제출하면 새 행이 아니라 기존 행이 되살아난다', () => {
  const s = loadServer({ responses: [withPw({ status: 'deleted' })] });
  const res = s.call({ action: 'save', empNo: '01234', name: '홍길동', pw: '5555', pickA: true, pickB: false });

  assert.equal(res.ok, true);
  assert.equal(s.rows().length, 1, '같은 사번의 active 행이 둘이 되면 안 된다');
  assert.equal(s.rows()[0][9], 'active');
});

test('비밀번호가 틀리면 저장하지 않는다', () => {
  const s = loadServer({ responses: [withPw()] });
  const res = s.call({ action: 'save', empNo: '01234', name: '홍길동', pw: '0000', pickA: true, pickB: true });
  assert.equal(res.error, 'WRONG_PW');
  assert.equal(s.rows()[0][2], false, '선택이 바뀌면 안 된다');
});

test('락을 못 잡으면 BUSY 이고 아무것도 쓰지 않는다', () => {
  const s = loadServer({ lockFails: true });
  const res = s.call({ action: 'save', empNo: '01234', name: '홍길동', pw: '1234', pickA: true, pickB: false });
  assert.equal(res.error, 'BUSY');
  assert.equal(s.rows().length, 0);
});

test('pick 값이 문자열로 와도 불리언으로 저장한다', () => {
  const s = loadServer();
  s.call({ action: 'save', empNo: '01234', name: '홍길동', pw: '1234', pickA: 'true', pickB: 1 });
  assert.equal(s.rows()[0][2], true);
  assert.equal(s.rows()[0][3], true);
});

test('저장하면 log 에 기록이 남는다', () => {
  const s = loadServer();
  s.call({ action: 'save', empNo: '01234', name: '홍길동', pw: '1234', pickA: true, pickB: false });
  const logs = s.logRows();
  assert.equal(logs.length, 1);
  assert.equal(logs[0][1], 'create');
  assert.equal(logs[0][2], '01234');
  assert.equal(logs[0][3], 'self');
  assert.equal(/1234/.test(logs[0][4]), false, '로그에 비밀번호가 새면 안 된다');
});

test('응답에 pwHash 나 salt 가 없다', () => {
  const s = loadServer();
  const res = s.call({ action: 'save', empNo: '01234', name: '홍길동', pw: '1234', pickA: true, pickB: false });
  const json = JSON.stringify(res);
  assert.equal(/pwHash|salt/.test(json), false);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `save` 가 `SERVER_ERROR`로 떨어진다

- [ ] **Step 3: `handleSave_` 구현**

`apps-script/Code.gs` 의 인증 블록 아래에 삽입한다:

```js
/** ===================== 저장 ===================== */

function handleSave_(req) {
  return withLock_(function () {
    var v = verifyCredentials_(req);
    if (v.ok === false) return v;

    var iso = now_().toISOString();
    var pickA = boolOf_(req.pickA);
    var pickB = boolOf_(req.pickB);
    var row = v.row;
    var action;

    if (!row) {
      // 삭제된 행이 있으면 되살린다. 같은 사번의 active 행이 둘이 되면 안 된다.
      var buried = findAnyByEmpNo_(readRows_(), v.empNo);
      if (buried.length > 0) {
        row = buried[0];
        row.status = 'active';
        row.name = v.name;
        action = 'update';
      } else {
        row = blankRow_(v.empNo, v.name);
        action = 'create';
      }
    } else {
      action = 'update';
    }

    if (!row.pwHash) {                 // 신규이거나 관리자 대리 입력 행
      row.salt = newSalt_();
      row.pwHash = hashPw_(row.salt, v.pw);
      if (action !== 'create') action = 'claim';
    }

    row.pickA = pickA;
    row.pickB = pickB;
    row.updatedAt = iso;
    row.updatedBy = 'self';
    row.failCount = 0;
    row.lockedUntil = '';
    if (!row.createdAt) row.createdAt = iso;

    if (row.rowIndex) writeRow_(row); else appendRow_(row);

    writeLog_(action, v.empNo, 'self', 'A=' + pickA + ' B=' + pickB);

    return ok_({ picks: { A: pickA, B: pickB }, updatedAt: iso });
  });
}
```

`handleRequest_`의 `switch`에 한 줄 추가한다:

```js
      case 'save': return handleSave_(req);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 55 tests

- [ ] **Step 5: 커밋**

```bash
git add apps-script/Code.gs test/save.test.mjs
git commit -m "feat: 선택 저장 (신규·수정·대리입력 이어받기·삭제행 부활)"
```

---

## Task 8: 관리자 API

**Files:**
- Modify: `apps-script/Code.gs`
- Test: `test/admin.test.mjs`

**Interfaces:**
- Consumes: Task 5–7 전부
- Produces:
  - `setupAdminPassword()` — 편집기에서 1회 실행하는 셋업 함수
  - `requireAdmin_(req) → null | 오류응답`
  - `computeStats_(rows) → { total, a, b, both, onlyA, onlyB, none }`
  - `computeWarnings_(rows) → [{ type, ... }]`
  - `handleAdminData_`, `handleAdminResetPw_`, `handleAdminUpsert_`, `handleAdminDelete_`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/admin.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './harness/load-code-gs.mjs';

const SALT = 'admin-salt';
function adminProps(pw = 'adminpass') {
  const s = loadServer();
  return { ADMIN_SALT: SALT, ADMIN_PW_HASH: s.fn.hashPw_(SALT, pw) };
}
function row(empNo, name, a, b, extra = {}) {
  return [empNo, name, a, b, extra.pwHash === undefined ? 'H' : extra.pwHash, 'S',
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', extra.by || 'self',
          extra.status || 'active', 0, ''];
}

/* ---------- 통계 ---------- */

test('computeStats_ 는 분포를 세고 합계가 맞는다', () => {
  const s = loadServer({
    responses: [
      row('00001', '가', true, true), row('00002', '나', true, true),
      row('00003', '다', true, false), row('00004', '라', false, true),
      row('00005', '마', false, false),
      row('00006', '바', true, true, { status: 'deleted' }),
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
  const s = loadServer({ responses: [row('00001', '가', true, true)], properties: adminProps() });
  const res = s.call({ action: 'adminData', adminPw: '틀림' });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'ADMIN_DENIED');
  assert.equal(/00001|가/.test(JSON.stringify(res)), false);
});

test('관리자 비밀번호가 설정돼 있지 않으면 거부한다', () => {
  const s = loadServer({ responses: [row('00001', '가', true, true)] });
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
    responses: [row('00001', '가', true, true), row('00002', '나', false, false, { pwHash: '' })],
    properties: adminProps(),
  });
  const res = s.call({ action: 'adminData', adminPw: 'adminpass' });
  assert.equal(/pwHash|"H"|"S"/.test(JSON.stringify(res)), false);
  assert.equal(res.data.rows[0].hasPw, true);
  assert.equal(res.data.rows[1].hasPw, false);
});

/* ---------- 경고 ---------- */

test('같은 이름 다른 사번을 경고한다', () => {
  const s = loadServer({
    responses: [row('01234', '홍길동', true, false), row('01243', '홍길동', false, true)],
    properties: adminProps(),
  });
  const w = s.call({ action: 'adminData', adminPw: 'adminpass' }).data.warnings;
  const hit = w.find((x) => x.type === 'SAME_NAME_DIFF_EMPNO');
  assert.ok(hit, '오타 후보를 잡아야 한다');
  assert.equal(hit.name, '홍길동');
  assert.deepEqual(hit.empNos.sort(), ['01234', '01243']);
});

test('같은 사번 다른 이름을 삭제분까지 훑어 경고한다', () => {
  const s = loadServer({
    responses: [row('00777', '김철수', true, false, { status: 'deleted' }),
                row('00777', '김철순', false, true)],
    properties: adminProps(),
  });
  const w = s.call({ action: 'adminData', adminPw: 'adminpass' }).data.warnings;
  const hit = w.find((x) => x.type === 'SAME_EMPNO_DIFF_NAME');
  assert.ok(hit);
  assert.equal(hit.empNo, '00777');
  assert.deepEqual(hit.names.sort(), ['김철수', '김철순'].sort());
});

test('정상 데이터에는 경고가 없다', () => {
  const s = loadServer({
    responses: [row('00001', '가', true, true), row('00002', '나', false, false)],
    properties: adminProps(),
  });
  assert.deepEqual(s.call({ action: 'adminData', adminPw: 'adminpass' }).data.warnings, []);
});

/* ---------- 조작 ---------- */

test('adminResetPw 는 비번을 비우고 잠금도 푼다', () => {
  const s = loadServer({
    responses: [['01234', '홍길동', true, false, 'H', 'S',
                 '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'self',
                 'active', 5, '2026-08-12T09:30:00.000Z']],
    properties: adminProps(),
  });
  const res = s.call({ action: 'adminResetPw', adminPw: 'adminpass', empNo: '1234' });
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
    responses: [['01234', '홍길동', true, false, 'H', 'S',
                 '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'self', 'active', 0, '']],
    properties: adminProps(),
  });
  s.call({ action: 'adminResetPw', adminPw: 'adminpass', empNo: '01234' });
  assert.equal(s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '4321' }).data.mode, 'claim');
  s.call({ action: 'save', empNo: '01234', name: '홍길동', pw: '4321', pickA: true, pickB: true });
  assert.equal(s.call({ action: 'auth', empNo: '01234', name: '홍길동', pw: '4321' }).data.mode, 'existing');
});

test('adminUpsert 는 없으면 만들고 비밀번호는 비워둔다', () => {
  const s = loadServer({ properties: adminProps() });
  const res = s.call({ action: 'adminUpsert', adminPw: 'adminpass', empNo: '42', name: '이 영희', pickA: true, pickB: false });

  assert.equal(res.ok, true);
  assert.equal(s.rows().length, 1);
  assert.equal(s.rows()[0][0], '00042', '사번을 정규화해서 넣는다');
  assert.equal(s.rows()[0][1], '이영희');
  assert.equal(s.rows()[0][4], '', '관리자는 남의 비밀번호를 정하지 않는다');
  assert.equal(s.rows()[0][8], 'admin');
});

test('adminUpsert 는 있으면 갱신한다', () => {
  const s = loadServer({ responses: [row('01234', '홍길동', false, false)], properties: adminProps() });
  s.call({ action: 'adminUpsert', adminPw: 'adminpass', empNo: '01234', name: '홍길동', pickA: true, pickB: true });
  assert.equal(s.rows().length, 1);
  assert.equal(s.rows()[0][2], true);
  assert.equal(s.rows()[0][4], 'H', '기존 비밀번호는 보존한다');
});

test('adminDelete 는 행을 지우지 않고 status 만 바꾼다', () => {
  const s = loadServer({ responses: [row('01234', '홍길동', true, true)], properties: adminProps() });
  const res = s.call({ action: 'adminDelete', adminPw: 'adminpass', empNo: '01234' });

  assert.equal(res.ok, true);
  assert.equal(s.rows().length, 1, '행이 남아 있어야 복구할 수 있다');
  assert.equal(s.rows()[0][9], 'deleted');
  assert.equal(s.call({ action: 'adminData', adminPw: 'adminpass' }).data.stats.total, 0);
  assert.equal(s.logRows()[0][1], 'admin_delete');
});

test('없는 사번을 지우거나 초기화하면 NOT_FOUND', () => {
  const s = loadServer({ properties: adminProps() });
  assert.equal(s.call({ action: 'adminDelete', adminPw: 'adminpass', empNo: '09999' }).error, 'NOT_FOUND');
  assert.equal(s.call({ action: 'adminResetPw', adminPw: 'adminpass', empNo: '09999' }).error, 'NOT_FOUND');
});

test('관리자 조작도 권한이 없으면 아무것도 바꾸지 않는다', () => {
  const s = loadServer({ responses: [row('01234', '홍길동', true, true)], properties: adminProps() });
  assert.equal(s.call({ action: 'adminDelete', adminPw: '틀림', empNo: '01234' }).error, 'ADMIN_DENIED');
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `adminData` 가 `SERVER_ERROR`로 떨어진다

- [ ] **Step 3: 관리자 기능 구현**

`apps-script/Code.gs` 의 저장 블록 아래에 삽입한다:

```js
/** ===================== 관리자 ===================== */

var P_ADMIN_HASH = 'ADMIN_PW_HASH';
var P_ADMIN_SALT = 'ADMIN_SALT';
var P_ADMIN_FAIL = 'ADMIN_FAIL_COUNT';
var P_ADMIN_LOCK = 'ADMIN_LOCKED_UNTIL';

/**
 * ▶ 편집기에서 한 번만 실행하는 셋업 함수.
 *   아래 'CHANGE_ME' 를 실제 관리자 비밀번호로 바꾸고 실행한 뒤,
 *   다시 'CHANGE_ME' 로 되돌려 저장할 것. (4자리 제한 없음. 길수록 좋다.)
 */
function setupAdminPassword() {
  setAdminPassword_('CHANGE_ME');
}

function setAdminPassword_(pw) {
  var props = PropertiesService.getScriptProperties();
  var salt = newSalt_();
  props.setProperty(P_ADMIN_SALT, salt);
  props.setProperty(P_ADMIN_HASH, hashPw_(salt, String(pw)));
  props.setProperty(P_ADMIN_FAIL, '0');
  props.deleteProperty(P_ADMIN_LOCK);
}

function requireAdmin_(req) {
  var props = PropertiesService.getScriptProperties();
  var hash = props.getProperty(P_ADMIN_HASH);
  var salt = props.getProperty(P_ADMIN_SALT);
  if (!hash || !salt) {
    return err_('ADMIN_DENIED', '관리자 비밀번호가 설정되어 있지 않습니다.');
  }

  var lockedUntil = props.getProperty(P_ADMIN_LOCK);
  if (lockedUntil && now_().getTime() < new Date(lockedUntil).getTime()) {
    return err_('LOCKED', '관리자 로그인이 일시적으로 잠겼습니다.', { lockedUntil: lockedUntil });
  }
  if (lockedUntil) {
    props.setProperty(P_ADMIN_FAIL, '0');
    props.deleteProperty(P_ADMIN_LOCK);
  }

  if (hashPw_(salt, String(req.adminPw == null ? '' : req.adminPw)) !== hash) {
    var fail = Number(props.getProperty(P_ADMIN_FAIL) || 0) + 1;
    props.setProperty(P_ADMIN_FAIL, String(fail));
    if (fail >= MAX_FAIL) {
      props.setProperty(P_ADMIN_LOCK,
        new Date(now_().getTime() + LOCK_MINUTES * 60000).toISOString());
    }
    return err_('ADMIN_DENIED', '관리자 비밀번호가 일치하지 않습니다.');
  }

  props.setProperty(P_ADMIN_FAIL, '0');
  return null;
}

function activeRows_(rows) {
  var out = [];
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].status === 'active') out.push(rows[i]);
  }
  return out;
}

function computeStats_(rows) {
  var st = { total: 0, a: 0, b: 0, both: 0, onlyA: 0, onlyB: 0, none: 0 };
  var act = activeRows_(rows);
  for (var i = 0; i < act.length; i += 1) {
    var r = act[i];
    st.total += 1;
    if (r.pickA) st.a += 1;
    if (r.pickB) st.b += 1;
    if (r.pickA && r.pickB) st.both += 1;
    else if (r.pickA) st.onlyA += 1;
    else if (r.pickB) st.onlyB += 1;
    else st.none += 1;
  }
  return st;
}

/** 자유 입력 방식의 대가인 오타를 관리자 눈에 먼저 띄게 한다. */
function computeWarnings_(rows) {
  var warnings = [];

  var byName = {};
  var act = activeRows_(rows);
  for (var i = 0; i < act.length; i += 1) {
    var n = act[i].name;
    if (!byName[n]) byName[n] = [];
    if (byName[n].indexOf(act[i].empNo) < 0) byName[n].push(act[i].empNo);
  }
  for (var name in byName) {
    if (byName[name].length > 1) {
      warnings.push({ type: 'SAME_NAME_DIFF_EMPNO', name: name, empNos: byName[name] });
    }
  }

  // 같은 사번은 active 가 하나뿐이므로 삭제분까지 봐야 잡힌다.
  var byEmp = {};
  for (var j = 0; j < rows.length; j += 1) {
    var e = rows[j].empNo;
    if (!byEmp[e]) byEmp[e] = [];
    if (byEmp[e].indexOf(rows[j].name) < 0) byEmp[e].push(rows[j].name);
  }
  for (var emp in byEmp) {
    if (byEmp[emp].length > 1) {
      warnings.push({ type: 'SAME_EMPNO_DIFF_NAME', empNo: emp, names: byEmp[emp] });
    }
  }

  return warnings;
}

function publicRow_(r) {
  return {
    empNo: r.empNo, name: r.name,
    pickA: !!r.pickA, pickB: !!r.pickB,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
    updatedBy: r.updatedBy, status: r.status,
    hasPw: !!r.pwHash,          // 해시 자체는 절대 내보내지 않는다
    locked: !!(r.lockedUntil && now_().getTime() < new Date(r.lockedUntil).getTime()),
  };
}

function handleAdminData_(req) {
  var denied = requireAdmin_(req);
  if (denied) return denied;

  var rows = readRows_();
  var act = activeRows_(rows);
  var out = [];
  for (var i = 0; i < act.length; i += 1) out.push(publicRow_(act[i]));
  out.sort(function (x, y) { return x.empNo < y.empNo ? -1 : (x.empNo > y.empNo ? 1 : 0); });

  return ok_({
    stats: computeStats_(rows),
    rows: out,
    warnings: computeWarnings_(rows),
  });
}

function handleAdminResetPw_(req) {
  return withLock_(function () {
    var denied = requireAdmin_(req);
    if (denied) return denied;

    var empNo = normalizeEmpNo_(req.empNo);
    if (!empNo) return err_('BAD_EMPNO', '사번은 숫자 5자리입니다.');

    var row = findByEmpNo_(readRows_(), empNo);
    if (!row) return err_('NOT_FOUND', '해당 사번의 응답이 없습니다.');

    row.pwHash = '';
    row.salt = '';
    row.failCount = 0;
    row.lockedUntil = '';
    writeRow_(row);
    writeLog_('admin_reset_pw', empNo, 'admin', '');

    return ok_({ empNo: empNo });
  });
}

function handleAdminUpsert_(req) {
  return withLock_(function () {
    var denied = requireAdmin_(req);
    if (denied) return denied;

    var empNo = normalizeEmpNo_(req.empNo);
    if (!empNo) return err_('BAD_EMPNO', '사번은 숫자 5자리입니다.');
    var name = normalizeName_(req.name);
    if (!name) return err_('BAD_NAME', '이름을 입력해주세요.');

    var rows = readRows_();
    var row = findByEmpNo_(rows, empNo);
    var isNew = false;
    if (!row) {
      var buried = findAnyByEmpNo_(rows, empNo);
      if (buried.length > 0) { row = buried[0]; row.status = 'active'; }
      else { row = blankRow_(empNo, name); isNew = true; }
    }

    row.name = name;
    row.pickA = boolOf_(req.pickA);
    row.pickB = boolOf_(req.pickB);
    row.updatedAt = now_().toISOString();
    row.updatedBy = 'admin';
    // pwHash 는 건드리지 않는다. 신규면 빈 값이라 본인이 나중에 이어받는다.

    if (row.rowIndex) writeRow_(row); else appendRow_(row);
    writeLog_('admin_upsert', empNo, 'admin',
      (isNew ? 'new ' : 'edit ') + 'A=' + row.pickA + ' B=' + row.pickB);

    return ok_({ empNo: empNo, created: isNew });
  });
}

function handleAdminDelete_(req) {
  return withLock_(function () {
    var denied = requireAdmin_(req);
    if (denied) return denied;

    var empNo = normalizeEmpNo_(req.empNo);
    if (!empNo) return err_('BAD_EMPNO', '사번은 숫자 5자리입니다.');

    var row = findByEmpNo_(readRows_(), empNo);
    if (!row) return err_('NOT_FOUND', '해당 사번의 응답이 없습니다.');

    row.status = 'deleted';
    row.updatedAt = now_().toISOString();
    row.updatedBy = 'admin';
    writeRow_(row);
    writeLog_('admin_delete', empNo, 'admin', '');

    return ok_({ empNo: empNo });
  });
}
```

`handleRequest_`의 `switch`에 네 줄 추가한다:

```js
      case 'adminData': return handleAdminData_(req);
      case 'adminResetPw': return handleAdminResetPw_(req);
      case 'adminUpsert': return handleAdminUpsert_(req);
      case 'adminDelete': return handleAdminDelete_(req);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 72 tests

- [ ] **Step 5: 커밋**

```bash
git add apps-script/Code.gs test/admin.test.mjs
git commit -m "feat: 관리자 통계·경고·비번초기화·대리입력·삭제"
```

---

## Task 9: 참여자 화면

**Files:**
- Create: `index.html`
- Create: `assets/app.js`

**Interfaces:**
- Consumes: `EXEC_URL`, `RETIREES`, `ORG_LABEL` (Task 3), `createApi` (Task 2), `normalizeEmpNo`/`normalizeName`/`normalizePw` (Task 4)
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: `index.html` 작성**

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>퇴임 선물 참여 조사</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="wrap">

  <!-- 1단계 -->
  <section class="card" id="step-intro">
    <h1 id="intro-title">퇴임 선물 참여 조사</h1>
    <p class="sub" id="intro-sub"></p>
    <p><b>두 분 다 / 한 분만 / 참여 안 함 — 모두 괜찮습니다.</b><br>
       편한 대로 선택해주세요. 다른 분이 무엇을 골랐는지는 아무도 볼 수 없습니다.</p>
    <p class="muted">
      · 금액은 참여 인원이 확정된 뒤 n분의 1로 나눕니다<br>
      · 제출한 뒤에도 언제든 다시 들어와 고칠 수 있습니다
    </p>
    <button id="btn-start">시작하기</button>
  </section>

  <!-- 2단계 -->
  <section class="card" id="step-login" hidden>
    <h1>본인 확인</h1>
    <p class="sub">나중에 수정하려면 아래 세 가지가 그대로 필요합니다.</p>

    <label for="f-empno">사번</label>
    <input id="f-empno" type="tel" inputmode="numeric" autocomplete="off"
           maxlength="7" placeholder="예: 1234 또는 01234">
    <div class="hint" id="hint-empno">5자리입니다. 앞의 0은 빼고 쓰셔도 됩니다.</div>

    <label for="f-name">이름</label>
    <input id="f-name" type="text" autocomplete="off" placeholder="예: 홍길동">
    <div class="hint" id="hint-name"></div>

    <label for="f-pw">비밀번호</label>
    <input id="f-pw" type="password" inputmode="numeric" autocomplete="off"
           maxlength="4" placeholder="숫자 4자리">
    <div class="hint">수정할 때 필요합니다. 꼭 기억해주세요.</div>

    <div id="login-err" class="err" hidden></div>
    <button id="btn-login">확인</button>
    <button id="btn-back-intro" class="ghost">뒤로</button>
  </section>

  <!-- 3단계 -->
  <section class="card" id="step-confirm" hidden>
    <h1>처음 참여하시는군요</h1>
    <p class="sub">이 정보가 맞는지 확인해주세요. 수정할 때 그대로 입력해야 합니다.</p>
    <table>
      <tr><th style="width:80px">사번</th><td id="c-empno" style="font-size:18px;font-weight:700"></td></tr>
      <tr><th>이름</th><td id="c-name" style="font-size:18px;font-weight:700"></td></tr>
    </table>
    <div class="row-btns">
      <button id="btn-confirm-no" class="ghost">다시 입력</button>
      <button id="btn-confirm-yes">네, 맞습니다</button>
    </div>
  </section>

  <!-- 4단계 -->
  <section class="card" id="step-pick" hidden>
    <h1 id="pick-title">누구까지 참여하시겠어요?</h1>
    <p class="sub">해당하는 분에 체크해주세요. 하나도 고르지 않아도 괜찮습니다.</p>
    <div id="pick-list"></div>
    <p class="muted">둘 다 선택하지 않고 제출하시면 <b>‘이번엔 참여하지 않음’</b>으로 기록됩니다.</p>
    <div id="pick-err" class="err" hidden></div>
    <button id="btn-submit">제출하기</button>
  </section>

  <!-- 5단계 -->
  <section class="card" id="step-done" hidden>
    <h1>제출되었습니다</h1>
    <p class="sub">감사합니다.</p>
    <div id="done-list"></div>
    <p class="muted">마음이 바뀌시면 같은 사번·이름·비밀번호로 다시 들어오셔서 고치시면 됩니다.</p>
    <button id="btn-again" class="ghost">처음으로</button>
  </section>

</div>
<script type="module" src="assets/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `assets/app.js` 작성**

```js
import { EXEC_URL, RETIREES, ORG_LABEL } from './config.js';
import { createApi } from './api.js';
import { normalizeEmpNo, normalizeName, normalizePw } from './normalize.js';

const api = createApi({ execUrl: EXEC_URL });
const $ = (id) => document.getElementById(id);

const STEPS = ['step-intro', 'step-login', 'step-confirm', 'step-pick', 'step-done'];
function show(id) {
  STEPS.forEach((s) => { $(s).hidden = (s !== id); });
  window.scrollTo(0, 0);
}

/** 이 세 값이 화면 전체의 상태다. */
const session = { empNo: '', name: '', pw: '', picks: { A: false, B: false } };

/* ---------- 1단계 ---------- */
$('intro-sub').textContent =
  `${ORG_LABEL} ${RETIREES.map((r) => r.label).join(' · ')}의 퇴임을 앞두고 선물을 준비합니다.`;
$('btn-start').addEventListener('click', () => { show('step-login'); $('f-empno').focus(); });
$('btn-back-intro').addEventListener('click', () => show('step-intro'));

/* ---------- 2단계 ---------- */
const empnoInput = $('f-empno');
const hintEmpno = $('hint-empno');

empnoInput.addEventListener('input', () => {
  const raw = empnoInput.value;
  if (raw.trim() === '') {
    hintEmpno.className = 'hint';
    hintEmpno.textContent = '5자리입니다. 앞의 0은 빼고 쓰셔도 됩니다.';
    return;
  }
  const norm = normalizeEmpNo(raw);
  if (norm) {
    hintEmpno.className = 'hint ok';
    hintEmpno.textContent = `사번 ${norm} 으로 조회합니다`;
  } else {
    hintEmpno.className = 'hint bad';
    hintEmpno.textContent = '사번은 숫자 5자리입니다. 다시 확인해주세요.';
  }
});

function showErr(boxId, message) {
  const box = $(boxId);
  box.textContent = message;
  box.hidden = false;
}
function clearErr(boxId) { $(boxId).hidden = true; }

async function doLogin() {
  clearErr('login-err');

  const empNo = normalizeEmpNo(empnoInput.value);
  const name = normalizeName($('f-name').value);
  const pw = normalizePw($('f-pw').value);

  if (!empNo) return showErr('login-err', '사번은 숫자 5자리입니다.');
  if (!name) return showErr('login-err', '이름을 입력해주세요.');
  if (!pw) return showErr('login-err', '비밀번호는 숫자 4자리입니다.');

  const btn = $('btn-login');
  btn.disabled = true;
  btn.textContent = '확인 중…';
  const res = await api.send({ action: 'auth', empNo, name, pw });
  btn.disabled = false;
  btn.textContent = '확인';

  if (!res.ok) return showErr('login-err', res.message || '오류가 발생했습니다.');

  session.empNo = res.data.empNo;
  session.name = res.data.name;
  session.pw = pw;
  session.picks = res.data.picks;

  if (res.data.mode === 'new') {
    $('c-empno').textContent = session.empNo;
    $('c-name').textContent = session.name;
    show('step-confirm');
  } else {
    renderPicks();
    show('step-pick');
  }
}

$('btn-login').addEventListener('click', doLogin);
$('f-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

/* ---------- 3단계 ---------- */
$('btn-confirm-no').addEventListener('click', () => { show('step-login'); empnoInput.focus(); });
$('btn-confirm-yes').addEventListener('click', () => { renderPicks(); show('step-pick'); });

/* ---------- 4단계 ---------- */
function renderPicks() {
  $('pick-title').textContent = `${session.name} 님, 누구까지 참여하시겠어요?`;
  const list = $('pick-list');
  list.innerHTML = '';
  RETIREES.forEach((r) => {
    const label = document.createElement('label');
    label.className = 'pick';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'pick-' + r.key;
    cb.checked = !!session.picks[r.key];
    const span = document.createElement('span');
    span.textContent = r.label;
    label.append(cb, span);
    list.appendChild(label);
  });
}

$('btn-submit').addEventListener('click', async () => {
  clearErr('pick-err');
  const pickA = $('pick-A').checked;
  const pickB = $('pick-B').checked;

  const btn = $('btn-submit');
  btn.disabled = true;
  btn.textContent = '제출 중…';
  const res = await api.send({
    action: 'save',
    empNo: session.empNo, name: session.name, pw: session.pw,
    pickA, pickB,
  });
  btn.disabled = false;
  btn.textContent = '제출하기';

  if (!res.ok) return showErr('pick-err', res.message || '오류가 발생했습니다.');

  session.picks = res.data.picks;
  renderDone();
  show('step-done');
});

/* ---------- 5단계 ---------- */
function renderDone() {
  const list = $('done-list');
  list.innerHTML = '';
  const table = document.createElement('table');
  RETIREES.forEach((r) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = r.label;
    const td = document.createElement('td');
    const joined = !!session.picks[r.key];
    td.textContent = joined ? '✓ 참여' : '— 미참여';
    td.style.color = joined ? 'var(--ok)' : 'var(--muted)';
    td.style.fontWeight = '700';
    tr.append(th, td);
    table.appendChild(tr);
  });
  list.appendChild(table);
}

$('btn-again').addEventListener('click', () => {
  session.empNo = ''; session.name = ''; session.pw = '';
  session.picks = { A: false, B: false };
  ['f-empno', 'f-name', 'f-pw'].forEach((id) => { $(id).value = ''; });
  hintEmpno.className = 'hint';
  hintEmpno.textContent = '5자리입니다. 앞의 0은 빼고 쓰셔도 됩니다.';
  show('step-intro');
});

show('step-intro');
```

화면 텍스트는 `textContent`로만 넣는다. 이름이 그대로 HTML로 해석되면 안 된다.

- [ ] **Step 3: 기존 테스트가 여전히 통과하는지 확인**

Run: `npm test`
Expected: PASS — 72 tests (화면 코드는 단위 테스트 대상이 아니다)

- [ ] **Step 4: 브라우저에서 화면 전환 확인**

Run: `npm run serve` 후 `http://localhost:8080/`
Expected:
- 랜딩 → `[시작하기]` → 로그인 화면
- 사번에 `1234` 입력 → 힌트가 초록색 「사번 01234 으로 조회합니다」로 바뀜
- 사번에 `123456` 입력 → 힌트가 빨간색 경고로 바뀜
- 사번/이름/비번을 채우고 `[확인]` → `EXEC_URL`이 아직 없으므로 「서버에 연결하지 못했습니다」 오류 박스
- 콘솔에 모듈 로드 오류가 없어야 한다

- [ ] **Step 5: 커밋**

```bash
git add index.html assets/app.js
git commit -m "feat: 참여자 5단계 화면"
```

---

## Task 10: 관리자 화면

**Files:**
- Create: `admin.html`
- Create: `assets/admin.js`

**Interfaces:**
- Consumes: `EXEC_URL`, `RETIREES` (Task 3), `createApi` (Task 2), `normalizeEmpNo`/`normalizeName` (Task 4), `adminData`/`adminResetPw`/`adminUpsert`/`adminDelete` (Task 8)
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: `admin.html` 작성**

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>관리자</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="wrap wide">

  <section class="card" id="gate">
    <h1>관리자</h1>
    <p class="sub">관리자 비밀번호를 입력해주세요.</p>
    <input id="admin-pw" type="password" autocomplete="off" placeholder="관리자 비밀번호">
    <div id="gate-err" class="err" hidden></div>
    <button id="btn-enter">들어가기</button>
  </section>

  <div id="panel" hidden>
    <section class="card">
      <h1>집계</h1>
      <div class="stat-row" id="stats"></div>
      <h2>선택 분포</h2>
      <div class="stat-row" id="dist"></div>
      <button id="btn-refresh" class="ghost">새로고침</button>
    </section>

    <section class="card" id="warn-card" hidden>
      <h1>확인이 필요한 항목</h1>
      <div id="warnings"></div>
    </section>

    <section class="card">
      <h1>응답 명단</h1>
      <div id="list-err" class="err" hidden></div>
      <div class="scroll"><table id="rows"></table></div>
      <button id="btn-copy" class="ghost">표 복사</button>
      <p class="muted" id="copied" hidden>클립보드에 담았습니다. 엑셀에 붙여넣으세요.</p>
    </section>

    <section class="card">
      <h1>대리 입력 · 수정</h1>
      <p class="sub">사이트를 못 쓰는 분을 대신 넣거나, 사번 오타로 잠긴 분을 구제할 때 씁니다.</p>
      <label for="u-empno">사번</label>
      <input id="u-empno" type="tel" inputmode="numeric" maxlength="7" placeholder="예: 1234">
      <label for="u-name">이름</label>
      <input id="u-name" type="text" placeholder="예: 홍길동">
      <div id="u-picks"></div>
      <div id="u-err" class="err" hidden></div>
      <button id="btn-upsert">저장</button>
      <p class="muted">비밀번호는 설정하지 않습니다. 본인이 나중에 직접 로그인할 때 정하게 됩니다.</p>
    </section>
  </div>

</div>
<script type="module" src="assets/admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: `assets/admin.js` 작성**

```js
import { EXEC_URL, RETIREES } from './config.js';
import { createApi } from './api.js';
import { normalizeEmpNo, normalizeName } from './normalize.js';

const api = createApi({ execUrl: EXEC_URL });
const $ = (id) => document.getElementById(id);

let adminPw = '';       // 메모리에만 둔다. 저장하지 않는다.
let lastRows = [];

function showErr(id, msg) { const b = $(id); b.textContent = msg; b.hidden = false; }
function clearErr(id) { $(id).hidden = true; }

/* ---------- 진입 ---------- */

async function enter() {
  clearErr('gate-err');
  const pw = $('admin-pw').value;
  if (!pw) return showErr('gate-err', '관리자 비밀번호를 입력해주세요.');

  const btn = $('btn-enter');
  btn.disabled = true; btn.textContent = '확인 중…';
  const res = await api.send({ action: 'adminData', adminPw: pw });
  btn.disabled = false; btn.textContent = '들어가기';

  if (!res.ok) return showErr('gate-err', res.message || '오류가 발생했습니다.');

  adminPw = pw;
  $('admin-pw').value = '';
  $('gate').hidden = true;
  $('panel').hidden = false;
  render(res.data);
  renderUpsertPicks();
}

$('btn-enter').addEventListener('click', enter);
$('admin-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });

async function refresh() {
  clearErr('list-err');
  const res = await api.send({ action: 'adminData', adminPw });
  if (!res.ok) return showErr('list-err', res.message || '오류가 발생했습니다.');
  render(res.data);
}
$('btn-refresh').addEventListener('click', refresh);

/* ---------- 렌더 ---------- */

function statTile(value, label) {
  const d = document.createElement('div');
  d.className = 'stat';
  const b = document.createElement('b'); b.textContent = String(value);
  const s = document.createElement('span'); s.textContent = label;
  d.append(b, s);
  return d;
}

function render(data) {
  lastRows = data.rows;

  const stats = $('stats');
  stats.innerHTML = '';
  stats.append(statTile(data.stats.total, '전체 응답'));
  stats.append(statTile(data.stats.a, RETIREES[0].label));
  stats.append(statTile(data.stats.b, RETIREES[1].label));

  const dist = $('dist');
  dist.innerHTML = '';
  dist.append(statTile(data.stats.both, '둘 다'));
  dist.append(statTile(data.stats.onlyA, `${RETIREES[0].label}만`));
  dist.append(statTile(data.stats.onlyB, `${RETIREES[1].label}만`));
  dist.append(statTile(data.stats.none, '참여 안 함'));

  renderWarnings(data.warnings);
  renderRows(data.rows);
}

function renderWarnings(warnings) {
  const card = $('warn-card');
  const box = $('warnings');
  box.innerHTML = '';
  if (!warnings || warnings.length === 0) { card.hidden = true; return; }
  card.hidden = false;
  warnings.forEach((w) => {
    const d = document.createElement('div');
    d.className = 'warn';
    d.textContent = w.type === 'SAME_NAME_DIFF_EMPNO'
      ? `‘${w.name}’ 님이 사번 ${w.empNos.join(' / ')} 로 두 건 있습니다. 사번 오타일 수 있습니다.`
      : `사번 ${w.empNo} 에 이름이 ${w.names.join(' / ')} 로 다르게 기록돼 있습니다.`;
    box.appendChild(d);
  });
}

function renderRows(rows) {
  const table = $('rows');
  table.innerHTML = '';

  const head = document.createElement('tr');
  ['사번', '이름', RETIREES[0].label, RETIREES[1].label, '최종수정', ''].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  });
  table.appendChild(head);

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'muted';
    td.textContent = '아직 응답이 없습니다.';
    tr.appendChild(td);
    table.appendChild(tr);
    return;
  }

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    const cells = [
      r.empNo,
      r.name + (r.hasPw ? '' : ' (비번 미설정)') + (r.locked ? ' 🔒' : ''),
      r.pickA ? '✓' : '—',
      r.pickB ? '✓' : '—',
      (r.updatedAt || '').slice(0, 10),
    ];
    cells.forEach((c) => {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    });

    const actions = document.createElement('td');
    actions.append(
      actionBtn('비번초기화', () => resetPw(r)),
      actionBtn('수정', () => loadIntoUpsert(r)),
      actionBtn('삭제', () => del(r)),
    );
    tr.appendChild(actions);
    table.appendChild(tr);
  });
}

function actionBtn(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.className = 'ghost';
  b.style.cssText = 'width:auto;margin:0 4px 0 0;padding:6px 10px;font-size:13px';
  b.addEventListener('click', onClick);
  return b;
}

/* ---------- 조작 ---------- */

async function resetPw(r) {
  if (!confirm(`${r.name}(${r.empNo}) 님의 비밀번호를 초기화합니다.\n`
             + '다음 로그인 때 입력하는 비밀번호가 새 비밀번호가 됩니다. 계속할까요?')) return;
  const res = await api.send({ action: 'adminResetPw', adminPw, empNo: r.empNo });
  if (!res.ok) return showErr('list-err', res.message);
  refresh();
}

async function del(r) {
  if (!confirm(`${r.name}(${r.empNo}) 님의 응답을 삭제합니다.\n`
             + '집계에서 빠지지만 시트에는 기록이 남습니다. 계속할까요?')) return;
  const res = await api.send({ action: 'adminDelete', adminPw, empNo: r.empNo });
  if (!res.ok) return showErr('list-err', res.message);
  refresh();
}

function loadIntoUpsert(r) {
  $('u-empno').value = r.empNo;
  $('u-name').value = r.name;
  $('up-A').checked = r.pickA;
  $('up-B').checked = r.pickB;
  $('u-empno').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderUpsertPicks() {
  const box = $('u-picks');
  box.innerHTML = '';
  RETIREES.forEach((r) => {
    const label = document.createElement('label');
    label.className = 'pick';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'up-' + r.key;
    const span = document.createElement('span');
    span.textContent = r.label;
    label.append(cb, span);
    box.appendChild(label);
  });
}

$('btn-upsert').addEventListener('click', async () => {
  clearErr('u-err');
  const empNo = normalizeEmpNo($('u-empno').value);
  const name = normalizeName($('u-name').value);
  if (!empNo) return showErr('u-err', '사번은 숫자 5자리입니다.');
  if (!name) return showErr('u-err', '이름을 입력해주세요.');

  const res = await api.send({
    action: 'adminUpsert', adminPw, empNo, name,
    pickA: $('up-A').checked, pickB: $('up-B').checked,
  });
  if (!res.ok) return showErr('u-err', res.message);

  $('u-empno').value = ''; $('u-name').value = '';
  $('up-A').checked = false; $('up-B').checked = false;
  refresh();
});

/* ---------- 표 복사 ---------- */

$('btn-copy').addEventListener('click', async () => {
  const header = ['사번', '이름', RETIREES[0].label, RETIREES[1].label, '최종수정'].join('\t');
  const body = lastRows.map((r) => [
    r.empNo, r.name, r.pickA ? 'O' : '', r.pickB ? 'O' : '', r.updatedAt,
  ].join('\t'));
  const text = [header, ...body].join('\n');
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  $('copied').hidden = false;
});
```

관리자 비밀번호는 `let adminPw` 로 **메모리에만** 둔다. `localStorage`에 넣으면 공용 PC에서 새어나간다. 새로고침하면 다시 입력해야 하는 건 의도된 동작이다.

- [ ] **Step 3: 기존 테스트가 여전히 통과하는지 확인**

Run: `npm test`
Expected: PASS — 72 tests

- [ ] **Step 4: 브라우저에서 확인**

Run: `npm run serve` 후 `http://localhost:8080/admin.html`
Expected:
- 비밀번호 입력 칸만 보이고 명단 영역은 감춰져 있다
- 아무 비밀번호나 넣고 `[들어가기]` → `EXEC_URL`이 없으므로 「서버에 연결하지 못했습니다」
- 콘솔에 모듈 로드 오류가 없어야 한다

- [ ] **Step 5: 커밋**

```bash
git add admin.html assets/admin.js
git commit -m "feat: 관리자 화면 (통계·경고·명단·대리입력)"
```

---

## Task 11: 통합 시나리오 테스트

단위 테스트는 각 조각을 확인했다. 이 태스크는 **스펙 §9의 시나리오 13개가 실제로 이어지는지**를 서버 수준에서 한 번에 검증한다.

**Files:**
- Test: `test/scenario.test.mjs`

**Interfaces:**
- Consumes: 모든 서버 핸들러
- Produces: 없음

- [ ] **Step 1: 시나리오 테스트 작성**

`test/scenario.test.mjs`:

```js
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
```

- [ ] **Step 2: 테스트 실행**

Run: `npm test`
Expected: PASS — 82 tests

**여기서 실패가 나오면 그것이 이 계획의 수확이다.** 단위 테스트는 통과하는데 시나리오가 깨지면, 조각 사이의 이음매에 버그가 있는 것이다. 고치고 다시 돌린다.

- [ ] **Step 3: 커밋**

```bash
git add test/scenario.test.mjs
git commit -m "test: 스펙 §9 시나리오 13개 통합 검증"
```

---

## Task 12: 배포와 사내망 검증

이 태스크만 **실제 구글 계정과 사내망 PC가 필요**하다. 앞의 태스크는 전부 로컬에서 끝난다.

**Files:**
- Modify: `assets/config.js` (EXEC_URL, RETIREES 라벨)

**Interfaces:**
- Consumes: 전부
- Produces: 동작하는 사이트

- [ ] **Step 1: 구글시트와 Apps Script 준비**

`README.md` 의 「배포 순서」 1·2단계를 그대로 수행한다.
`responses` A열 서식을 **일반 텍스트**로 지정하는 것을 빠뜨리지 말 것.

- [ ] **Step 2: GitHub Pages 배포**

`README.md` 3단계 수행. `.gitignore`가 `명단.md`를 막고 있는지 push 전에 확인한다.

Run: `git status --short`
Expected: `명단.md` 가 목록에 **없어야** 한다

- [ ] **Step 3: `config.js` 채우기**

`assets/config.js` 의 `EXEC_URL` 을 실제 웹앱 주소로, `RETIREES` 의 `label` 두 개를 실제 표기로 바꾼 뒤 push 한다.

- [ ] **Step 4: 사내망에서 진단**

사내망 PC에서 `https://<계정>.github.io/<저장소>/test.html` 을 연다.

Expected: ①②③④ 결과와 판정 문구가 표시된다. `[결과 전체 복사]` 로 결과를 확보한다.

- 판정이 「① fetch 경로로 정상 동작 가능」 → Step 5로
- 판정이 「① 막힘 → ② JSONP 경로」 → 그대로 진행 가능. 다만 프록시 기록에 비밀번호가 남을 수 있음을 관리자에게 알린다
- 판정이 「①② 모두 실패」 → **여기서 멈춘다.** 설계 문서 §7의 3차 안(화면을 Apps Script `HtmlService`로 이전)이 필요하며, 별도 계획을 세운다. 서버 로직과 시트 구조는 그대로 재사용된다

- [ ] **Step 5: 실제 브라우저에서 시나리오 확인**

사내망 PC에서 실제 사이트를 열고 확인한다:

1. 본인 사번 앞의 0을 빼고 입력 → 힌트에 5자리 사번이 표시되는가
2. 확인 화면에서 사번·이름이 맞게 보이는가
3. 제출 후 구글시트 `responses` 에 행이 생겼는가. **A열이 `01234` 형태로 0이 살아 있는가**
4. 같은 정보로 다시 로그인 → 이전 선택이 체크되어 있는가
5. 하나 해제하고 제출 → 시트의 행 수가 그대로인가
6. `admin.html` 에서 관리자 비밀번호로 진입 → 통계가 맞는가
7. `[비번초기화]` 후 그 사번으로 새 비밀번호 로그인이 되는가
8. `[삭제]` 후 통계에서 빠지고 시트에는 `deleted` 로 남는가
9. 대리 입력한 사람이 직접 로그인해 이어받을 수 있는가

- [ ] **Step 6: 테스트 데이터 정리**

확인용으로 넣은 행을 구글시트에서 **직접 삭제**한다 (관리자 화면의 삭제는 soft delete라 행이 남는다).
`log` 시트도 비운다. 헤더 1행은 남긴다.

- [ ] **Step 7: 커밋**

```bash
git add assets/config.js
git commit -m "chore: 운영 배포 설정 (EXEC_URL, 퇴직자 표기)"
```

> `EXEC_URL` 은 비밀이 아니다 — 공개 저장소에 들어가도 된다. 관리자 비밀번호는 Script Properties 에만 있고 이 파일에는 없다.

---

## 완료 기준

- [ ] `npm test` 82개 통과
- [ ] `git status` 에 `명단.md` 가 없다
- [ ] 사내망에서 `test.html` 판정이 ① 또는 ②
- [ ] Task 12 Step 5의 9개 항목을 실제 사이트에서 확인
- [ ] 시트 A열에 사번 앞자리 0이 살아 있다
- [ ] 확인용 테스트 데이터를 지웠다
