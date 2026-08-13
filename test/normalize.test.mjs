import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, normalizePw, normalizeEmail } from '../assets/normalize.js';
import { loadServer } from './harness/load-code-gs.mjs';
import { NAME_CASES, PW_CASES, EMAIL_CASES } from './cases/normalize-cases.mjs';

const server = loadServer().fn;

const IMPLS = [
  { label: '브라우저', name: normalizeName, pw: normalizePw },
  { label: '서버',     name: server.normalizeName_, pw: server.normalizePw_ },
];

for (const impl of IMPLS) {
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
  const inputs = ['1234', 'hong.gildong', '１２３', 'abc', '', '999999', ' 7 ', 'abc@etri.re.kr'];
  for (const raw of inputs) {
    assert.equal(normalizeName(raw), server.normalizeName_(raw), `이름 ${JSON.stringify(raw)}`);
    assert.equal(normalizePw(raw), server.normalizePw_(raw), `비번 ${JSON.stringify(raw)}`);
  }
});

test('[브라우저] 이메일 정규화', () => {
  for (const c of EMAIL_CASES) {
    assert.equal(normalizeEmail(c.input), c.expected, `${JSON.stringify(c.input)} — ${c.why}`);
  }
});

test('[서버] 이메일 정규화', () => {
  for (const c of EMAIL_CASES) {
    assert.equal(server.normalizeEmail_(c.input), c.expected, `${JSON.stringify(c.input)} — ${c.why}`);
  }
});

test('이메일 정규화도 두 구현이 같은 답을 낸다', () => {
  const inputs = ['abc', 'ABC', 'abc@etri.re.kr', 'abc@etri.kr', 'a b', '', '가나다', 'a'.repeat(65)];
  for (const raw of inputs) {
    assert.equal(normalizeEmail(raw), server.normalizeEmail_(raw), JSON.stringify(raw));
  }
});
