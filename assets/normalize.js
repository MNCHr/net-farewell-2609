/**
 * 이메일·이름·비밀번호 정규화.
 *
 * 같은 규칙이 apps-script/Code.gs 에도 있다. 한쪽만 고치면 안 된다.
 * test/cases/normalize-cases.mjs 가 두 구현을 함께 검증한다.
 */

import { EMAIL_DOMAIN } from './config.js';

const FULLWIDTH_DIGITS = /[０-９]/g;
// \s 는 U+3000(전각 공백)도 포함하지만, 제로폭 문자는 따로 지워야 한다.
// 눈에 안 보이는 문자를 소스에 원문자 그대로 박아두지 않는다 — 이 파일을 편집기 사이로
// 옮겨적다가 한 글자만 빠져도(U+FEFF 가 실제로 두 번 그렇게 사라진 적이 있다) 살아남은
// 글자들이 뒤집힌 범위(reversed range)가 되어 SyntaxError 로 깨진다. 전부 \uXXXX 로 적는다.
// U+200B-U+200D 는 제로폭 공백·비접합자·접합자 세 글자를 범위 하나로 묶은 것이다.
const WHITESPACE = /[\s\u3000\u200B-\u200D\uFEFF]/g;

export const PW_LENGTH = 4;
export const NAME_MAX = 20;

// PW_LENGTH 를 실제로 쓴다 — 상수를 선언만 해두고 정작 규칙은 정규식에 4를 박아두면,
// 둘 중 하나만 고치는 날 값이 어긋난다. Code.gs 도 같은 방식으로 PW_RE_ 를 쓴다.
const PW_RE = new RegExp(`^[0-9]{${PW_LENGTH}}$`);

function toHalfWidthDigits(s) {
  return s.replace(FULLWIDTH_DIGITS, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
}

/** '홍 길동' → '홍길동'. 공백을 모두 지우고 NFC 로 모은다. */
export function normalizeName(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).normalize('NFC').replace(WHITESPACE, '');
  if (cleaned.length === 0 || cleaned.length > NAME_MAX) return null;
  return cleaned;
}

/** 숫자 4자리만 허용. 앞자리 0이 있어도 그대로 두고 채우지 않는다. */
export function normalizePw(raw) {
  if (raw === null || raw === undefined) return null;
  const s = toHalfWidthDigits(String(raw)).replace(WHITESPACE, '');
  if (!PW_RE.test(s)) return null;
  return s;
}

export const LOCAL_PART_MAX = 64;

const LOCAL_PART_RE = new RegExp(`^[a-z0-9._+-]{1,${LOCAL_PART_MAX}}$`);

/**
 * 'abc' / 'ABC' / 'abc@etri.re.kr' → 'abc@etri.re.kr'.
 *
 * 아이디(@ 앞)만 신원으로 쓰고 도메인은 버린다. 도메인을 신원에 포함시키면
 * 같은 사람이 입력 방식에 따라 두 행으로 갈라진다.
 */
export function normalizeEmail(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).trim().toLowerCase();
  const local = cleaned.indexOf('@') >= 0 ? cleaned.slice(0, cleaned.indexOf('@')) : cleaned;
  if (!LOCAL_PART_RE.test(local)) return null;
  return local + '@' + EMAIL_DOMAIN;
}
