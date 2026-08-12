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
