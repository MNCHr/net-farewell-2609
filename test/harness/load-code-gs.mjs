import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  makeUtilities, makeSheet, makeSpreadsheetApp, makePropertiesService, makeLockService,
  makeContentService,
} from './apps-script-fakes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CODE_PATH = path.join(ROOT, 'apps-script', 'Code.gs');

/**
 * Code.gs 는 node:vm 이 만든 별도 realm(별도 Array/Object/Date 생성자 세트) 안에서 실행된다.
 * 그 안에서 만들어진 배열/객체 리터럴은 이 파일(host realm)의 Array.prototype/Object.prototype
 * 과 다른 프로토타입을 갖는다. node:assert/strict 의 deepEqual 은 deepStrictEqual 이라
 * 프로토타입(realm) 까지 비교하므로, 내용이 완전히 같아도 realm 이 다르면
 * "Values have same structure but are not reference-equal" 로 실패한다.
 *
 * hostify() 는 sandbox realm 에서 나온 값을 host realm 의 평범한 배열/객체/원시값으로
 * 재귀적으로 복사해서, 이 문제를 테스트 하나하나가 아니라 하네스 경계에서 한 번에 없앤다.
 * 얕은 `[...arr]` 스프레드로는 안 된다 — 바깥 배열만 host realm 이 되고, 그 안에 중첩된
 * 배열/객체는 여전히 sandbox realm 이라 여전히 실패한다 (예: `handleRequest_` 가 돌려주는
 * `{ ok: true, data: { picks: {...} } }` 처럼 객체 안에 객체가 있는 응답, 또는 시트 한 행이
 * 배열인 행들의 배열).
 *
 * 지우고 싶어질 수 있지만 지우면 안 된다 — 이게 없으면 `res.data.picks` 같은 중첩 값을
 * host 리터럴과 `assert.deepEqual` 로 비교하는 테스트가 전부 realm 불일치로 깨진다.
 */
export function hostify(value, seen = new WeakMap()) {
  // 원시값(string/number/boolean/bigint/symbol/undefined) 과 null 은 realm 이 없다.
  if (value === null || typeof value !== 'object') return value;

  if (seen.has(value)) return seen.get(value); // 순환 참조 방어

  // Array.isArray 는 realm 을 가리지 않고 동작한다 (ECMA-262 사양상 [[Class]] 검사).
  if (Array.isArray(value)) {
    const out = [];
    seen.set(value, out);
    for (let i = 0; i < value.length; i += 1) out.push(hostify(value[i], seen));
    return out;
  }

  // Object.prototype.toString.call 도 realm 을 가리지 않는다. instanceof/constructor
  // 비교는 sandbox Date 가 host Date 가 아니라서 못 쓴다.
  if (Object.prototype.toString.call(value) === '[object Date]') {
    const out = new Date(value.getTime());
    seen.set(value, out);
    return out;
  }

  // 평범한 객체 리터럴인지 판별한다: 어느 realm 이든 객체 리터럴의 프로토타입은
  // 그 realm 의 Object.prototype 이고, Object.prototype 자신의 프로토타입은 null 이다.
  // 이 판별은 sandbox/host 어느 쪽 Object.prototype 인지 몰라도 통과한다.
  // 함수나 (사용자 정의 클래스 인스턴스처럼) 프로토타입 체인이 한 단계 더 있는 값은
  // 여기 걸리지 않고 원본 그대로 돌려준다 — 잘못 복제해서 메서드/동작을 잃는 것보다 낫다.
  const proto = Object.getPrototypeOf(value);
  const isPlainObject = proto === null || Object.getPrototypeOf(proto) === null;
  if (!isPlainObject) return value;

  const out = {};
  seen.set(value, out);
  for (const key of Object.keys(value)) out[key] = hostify(value[key], seen);
  return out;
}

export const HEADER_RESPONSES = [
  'email', 'name', 'pickA', 'pickB', 'pwHash', 'salt',
  'createdAt', 'updatedAt', 'updatedBy', 'status', 'failCount', 'lockedUntil',
];
export const HEADER_LOG = ['at', 'action', 'email', 'actor', 'detail'];

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
    ContentService: makeContentService(),
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CODE_PATH, 'utf8'), sandbox, { filename: 'Code.gs' });

  let current = new Date(now);
  sandbox.now_ = () => new Date(current.getTime());   // 시간 고정

  return {
    // call()/rows()/logRows() 는 sandbox realm 값이 테스트로 넘어오는 경계다 — hostify 를 거친다.
    call: (req) => hostify(sandbox.handleRequest_(req)),
    // sheets 와 fn 은 절대 hostify 하지 않는다: sheets 는 테스트가 직접 조작하는 살아있는 fake
    // (예: `delete s.sheets.responses`) 이고, fn 은 sandbox 그 자체라서 `s.fn.hashPw_` 처럼
    // 서버 함수를 꺼내 쓰거나 `sandbox.now_` 를 갈아끼우는 데 쓰인다. 복사하면 이 둘이 깨진다.
    fn: sandbox,
    sheets,
    setNow: (iso) => { current = new Date(iso); },
    rows: () => hostify(sheets.responses.__rows().slice(1)),
    logRows: () => hostify(sheets.log.__rows().slice(1)),
  };
}
