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
