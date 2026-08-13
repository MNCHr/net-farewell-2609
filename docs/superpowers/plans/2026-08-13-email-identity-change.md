# 신원 모델 변경(사번 → 이메일) + 퇴직자별 표 복사 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 신원을 사번에서 회사 이메일로 바꾸고, 관리자가 퇴직자별 참여자 표를 따로 복사할 수 있게 한다.

**Architecture:** 정규화 함수 하나(`normalizeEmail`)가 입력을 받아 `아이디@etri.re.kr` 을 돌려주고, 그 반환값이 곧 신원이자 저장값이다. 도메인은 신원에서 무시해 `abc` / `ABC` / `abc@etri.re.kr` 이 모두 한 사람으로 모인다. 표 복사는 순수 함수 하나에 행 필터만 갈아끼우는 구조로 만들어 Node 에서 테스트한다.

**Tech Stack:** 기존 그대로 — 바닐라 JS(ES 모듈) · Apps Script(V8) · Google Sheets · Node 18 `node --test` · `node:vm` 하네스.

**설계 문서:** `docs/superpowers/specs/2026-08-13-email-identity-change-design.md` — 충돌하면 스펙이 이긴다.

**현재 상태:** 사이트는 배포되어 동작 중이나 **아직 아무에게도 공지하지 않았고 시트에는 테스트 행만 있다.** 기존 응답 이전은 고려하지 않는다. `npm test` 는 현재 106개 통과.

## Global Constraints

- 도메인은 `etri.re.kr`. `assets/config.js` 의 `EMAIL_DOMAIN` 과 `apps-script/Code.gs` 의 `EMAIL_DOMAIN` 두 곳에 있고 **두 값이 어긋나면 화면에 보이는 것과 저장되는 것이 달라진다**
- 정규화 규칙은 `assets/normalize.js`(브라우저)와 `apps-script/Code.gs`(서버)에 **두 벌 존재**한다. `test/cases/normalize-cases.mjs` 의 **동일한 케이스 표로 양쪽을 모두 검증**한다
- 이메일 정규화: 공백 제거 → 소문자 → `@` 앞부분만 → `^[a-z0-9._+-]{1,64}$` 검사 → `아이디@etri.re.kr`
- 이름은 **모든 공백 제거 + NFC**, 빈 값·20자 초과는 오류 (변경 없음)
- 비밀번호는 **숫자 4자리**, 저장은 `Base64(SHA-256(salt + '|' + pw))` (변경 없음)
- 비밀번호 연속 실패 **5회** → **10분** 잠금 (변경 없음)
- 쓰기 작업과 `auth`/`adminData` 는 `withLock_` 으로 직렬화, 대기 **30초**, 초과 시 `BUSY` (변경 없음)
- 삭제는 **soft delete** (`status='deleted'`) (변경 없음)
- 응답에 `pwHash`·`salt` 를 **절대 포함하지 않는다** (변경 없음)
- 사용자에게 보여줄 한국어 문구는 **서버가 만들어 `message` 필드로 내려보낸다** (변경 없음)
- 시각은 전부 `now_()` 를 거친다 (변경 없음)
- `apps-script/Code.gs` 는 Apps Script 편집기에 통째로 붙여넣는 단일 파일이다. ES5-ish 스타일(`var`, `function`, 화살표 함수 없음)을 유지하고 쪼개지 않는다
- 정규식에 보이지 않는 문자를 원문자로 박지 않는다. 전부 `\uXXXX` 로 적는다
- 각 태스크의 "Expected: PASS — N tests" 는 작성 시점 추정치다. **실제 수가 기준이고, 추정치가 틀렸다고 테스트를 지우지 말 것**

---

## File Structure

| 파일 | 이번 변경에서의 책임 |
|---|---|
| `assets/config.js` | `EMAIL_DOMAIN` 추가 |
| `assets/normalize.js` | `normalizeEmpNo` 제거, `normalizeEmail` 추가 |
| `apps-script/Code.gs` | 같은 규칙의 서버 구현 + `empNo`→`email` 전면 개명 |
| `assets/table.js` | **신규.** 표 텍스트를 만드는 순수 함수. DOM 을 건드리지 않아 Node 에서 테스트된다 |
| `assets/admin.js` | 표 복사 버튼 3개 연결, 라벨 변경 |
| `admin.html` | 복사 버튼 2개 추가, 라벨 변경 |
| `assets/app.js` / `index.html` | 로그인 칸 라벨·힌트·오류 문구 |
| `test/cases/normalize-cases.mjs` | `EMPNO_CASES` → `EMAIL_CASES` |
| `test/table.test.mjs` | **신규.** 표 생성 함수 테스트 |

`assets/table.js` 를 새로 만드는 이유: `assets/admin.js` 는 최상위에서 `document.getElementById(...)` 를 호출하므로 Node 에서 `import` 하면 즉시 죽는다. 표 생성 로직만 순수 함수로 떼어내면 브라우저 없이 검증할 수 있고, 세 버튼이 같은 코드 경로를 쓴다는 것도 구조로 보장된다.

---

## Task 1: `normalizeEmail` 도입

기존 코드를 건드리지 않고 새 규칙만 추가한다. 이 태스크가 끝나도 사이트는 여전히 사번으로 동작한다.

**Files:**
- Modify: `assets/config.js`
- Modify: `assets/normalize.js`
- Modify: `apps-script/Code.gs`
- Modify: `test/cases/normalize-cases.mjs`
- Modify: `test/normalize.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `EMAIL_DOMAIN` — `assets/config.js` 에서 export, `Code.gs` 에 같은 값의 `var`
  - 브라우저: `normalizeEmail(raw) → string|null`
  - 서버: `normalizeEmail_(raw) → string|null`
  - `EMAIL_CASES` — `{ input, expected, why }[]`
  - `LOCAL_PART_MAX = 64`

- [ ] **Step 1: 공용 케이스 표에 `EMAIL_CASES` 추가**

`test/cases/normalize-cases.mjs` 의 `EMPNO_CASES` **아래**에 추가한다 (`EMPNO_CASES` 는 아직 지우지 않는다):

```js
// 이메일 신원. 아이디(@ 앞)만 신원으로 쓰고, 저장할 때 도메인을 붙인다.
// 도메인을 신원에 넣으면 같은 사람이 'abc' 와 'abc@etri.re.kr' 로 갈라진다 —
// 사번의 앞자리 0과 같은 함정이다.
export const EMAIL_CASES = [
  { input: 'abc', expected: 'abc@etri.re.kr', why: '아이디만 입력 — 기본 사용법' },
  { input: 'ABC', expected: 'abc@etri.re.kr', why: '대문자로 쳐도 같은 사람' },
  { input: 'AbC', expected: 'abc@etri.re.kr', why: '섞어 쳐도 같은 사람' },
  { input: 'abc@etri.re.kr', expected: 'abc@etri.re.kr', why: '전체 이메일 붙여넣기 — 가장 흔할 입력 편차' },
  { input: 'ABC@ETRI.RE.KR', expected: 'abc@etri.re.kr', why: '전체 이메일을 대문자로' },
  { input: 'abc@etri.kr', expected: 'abc@etri.re.kr', why: '도메인이 달라도 아이디가 같으면 같은 사람' },
  { input: 'abc@', expected: 'abc@etri.re.kr', why: '@ 까지만 치고 만 경우 — 아이디가 유효하면 통과' },
  { input: ' abc ', expected: 'abc@etri.re.kr', why: '앞뒤 공백' },
  { input: 'hong.gildong', expected: 'hong.gildong@etri.re.kr', why: '점' },
  { input: 'hgd_2', expected: 'hgd_2@etri.re.kr', why: '밑줄' },
  { input: 'gildong-h', expected: 'gildong-h@etri.re.kr', why: '하이픈' },
  { input: 'a+b', expected: 'a+b@etri.re.kr', why: '플러스' },
  { input: 'a', expected: 'a@etri.re.kr', why: '한 글자' },
  { input: 'a'.repeat(64), expected: 'a'.repeat(64) + '@etri.re.kr', why: '경계값 64자는 통과' },
  { input: 'a'.repeat(65), expected: null, why: '64자 초과' },
  { input: '@etri.re.kr', expected: null, why: '@ 앞이 비었다' },
  { input: '', expected: null, why: '빈 값' },
  { input: '   ', expected: null, why: '공백뿐' },
  { input: '가나다', expected: null, why: '한글은 아이디에 못 쓴다' },
  { input: 'a b', expected: null, why: '가운데 공백 — 두 사람을 붙여 친 것일 수 있어 통과시키면 안 된다' },
  { input: 'a!b', expected: null, why: '허용하지 않는 기호' },
  { input: 'a/b', expected: null, why: '허용하지 않는 기호' },
  { input: null, expected: null, why: 'null' },
  { input: undefined, expected: null, why: 'undefined' },
];
```

- [ ] **Step 2: 실패하는 테스트 추가**

`test/normalize.test.mjs` 의 import 줄에 `EMAIL_CASES` 를 더하고, 파일 **끝**에 추가한다:

```js
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
```

import 줄을 이렇게 바꾼다:

```js
import { normalizeEmpNo, normalizeName, normalizePw, normalizeEmail } from '../assets/normalize.js';
import { EMPNO_CASES, NAME_CASES, PW_CASES, EMAIL_CASES } from './cases/normalize-cases.mjs';
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `node --test test/normalize.test.mjs`
Expected: FAIL — `normalizeEmail is not a function`

- [ ] **Step 4: `assets/config.js` 에 도메인 추가**

`ORG_LABEL` 아래에 추가한다:

```js
/**
 * 로그인 아이디에 붙일 회사 이메일 도메인. '@' 는 포함하지 않는다.
 * apps-script/Code.gs 의 EMAIL_DOMAIN 과 반드시 같아야 한다 —
 * 어긋나면 화면에 보이는 값과 실제 저장되는 값이 달라진다.
 */
export const EMAIL_DOMAIN = 'etri.re.kr';
```

- [ ] **Step 5: 브라우저 구현 추가**

`assets/normalize.js` 의 **맨 위**에 import 를 추가한다. `config.js` 는 아무것도 import 하지
않으므로 순환은 생기지 않는다. 도메인은 **`config.js` 에만** 둔다 — 운영 중 고칠 값을 한 곳에
모으기로 한 규칙이고, 같은 값을 세 곳에 두면 어긋날 자리가 하나 더 생긴다:

```js
import { EMAIL_DOMAIN } from './config.js';
```

그리고 `normalizePw` **아래**에 추가한다:

```js
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
  const cleaned = String(raw).replace(WHITESPACE, '').toLowerCase();
  const local = cleaned.indexOf('@') >= 0 ? cleaned.slice(0, cleaned.indexOf('@')) : cleaned;
  if (!LOCAL_PART_RE.test(local)) return null;
  return local + '@' + EMAIL_DOMAIN;
}
```

`WHITESPACE` 는 이 파일에 이미 있는 상수를 그대로 쓴다. 공백을 **먼저** 지우므로 `'a b'` 는
`'ab'` 가 되어 통과할 것 같지만 — 그렇지 않다. 아래 Step 6 의 주의를 함께 볼 것.

- [ ] **Step 6: `'a b'` 가 통과하지 않는지 확인하고 고친다**

Run: `node --test test/normalize.test.mjs`
Expected: FAIL — `'a b'` 케이스에서 `'ab@etri.re.kr'` 이 나온다 (기대값은 `null`)

`WHITESPACE` 로 공백을 지워버리면 `'a b'` 가 `'ab'` 로 붙어 통과한다. 이름과 달리 아이디는
**가운데 공백이 있으면 잘못 친 것**이므로 통과시키면 안 된다 (두 사람 아이디를 붙여 쳤을 수도 있다).
공백은 **앞뒤만** 다듬는다. `normalizeEmail` 의 `cleaned` 줄을 이렇게 바꾼다:

```js
  const cleaned = String(raw).trim().toLowerCase();
```

`trim()` 은 U+3000(전각 공백)도 지운다. 제로폭 문자는 `LOCAL_PART_RE` 가 걸러낸다.

- [ ] **Step 7: 서버 구현 추가**

`apps-script/Code.gs` 의 `normalizePw_` **아래**에 추가한다:

```js
/** assets/normalize.js 의 EMAIL_DOMAIN 과 반드시 같아야 한다. */
var EMAIL_DOMAIN = 'etri.re.kr';
var LOCAL_PART_MAX = 64;
var LOCAL_PART_RE_ = new RegExp('^[a-z0-9._+-]{1,' + LOCAL_PART_MAX + '}$');

/**
 * 'abc' / 'ABC' / 'abc@etri.re.kr' → 'abc@etri.re.kr'.
 *
 * 아이디(@ 앞)만 신원으로 쓰고 도메인은 버린다. 도메인을 신원에 포함시키면
 * 같은 사람이 입력 방식에 따라 두 행으로 갈라진다.
 */
function normalizeEmail_(raw) {
  if (raw === null || raw === undefined) return null;
  var cleaned = String(raw).trim().toLowerCase();
  var at = cleaned.indexOf('@');
  var local = at >= 0 ? cleaned.slice(0, at) : cleaned;
  if (!LOCAL_PART_RE_.test(local)) return null;
  return local + '@' + EMAIL_DOMAIN;
}
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 109 tests (기존 106 + 신규 3)

- [ ] **Step 9: 커밋**

```bash
git add assets/config.js assets/normalize.js apps-script/Code.gs test/cases/normalize-cases.mjs test/normalize.test.mjs
git commit -m "feat: 이메일 신원 정규화 규칙 추가 (아직 아무도 쓰지 않는다)"
```

---

## Task 2: 신원 교체 — `empNo` → `email`

**Files:**
- Modify: `apps-script/Code.gs`, `assets/normalize.js`, `assets/app.js`, `assets/admin.js`
- Modify: `index.html`, `admin.html`
- Modify: `test/harness/load-code-gs.mjs`, `test/cases/normalize-cases.mjs`, 모든 `test/*.test.mjs`

**Interfaces:**
- Consumes: Task 1 의 `normalizeEmail` / `normalizeEmail_`
- Produces:
  - 요청·응답 필드 `email` (이전 `empNo`)
  - `COL.EMAIL`, `HEADER_RESPONSES[0] === 'email'`
  - 오류 코드 `BAD_EMAIL`
  - 경고 `SAME_NAME_DIFF_EMAIL` / `SAME_EMAIL_DIFF_NAME`
  - `findByEmail_(rows, email)`, `findAnyByEmail_(rows, email)`

- [ ] **Step 1: 옛 사번 규칙을 먼저 지운다**

**순서가 중요하다.** Task 1 이 이미 `normalizeEmail` 을 만들어 두었으므로, 개명을 먼저 하면
`normalizeEmpNo` → `normalizeEmail` 치환이 **같은 이름의 함수를 둘 만든다.** 정의를 먼저 지운다.

`assets/normalize.js`:
- `export function normalizeEmpNo(...)` 정의 블록 전체를 지운다 (주석 포함)
- `export const EMPNO_LENGTH = 5;` 를 지운다
- `const NON_DIGIT = /[^0-9]/g;` 를 지운다 (이제 아무도 안 쓴다)
- `FULLWIDTH_DIGITS` 와 `toHalfWidthDigits` 는 **남긴다** — `normalizePw` 가 쓴다
- 파일 맨 위 주석의 "사번·이름·비밀번호" 를 "이메일·이름·비밀번호" 로

`apps-script/Code.gs`:
- `function normalizeEmpNo_(...)` 정의 블록 전체를 지운다
- `var EMPNO_LENGTH = 5;` 를 지운다
- `toHalfWidthDigits_` 는 **남긴다**

`test/cases/normalize-cases.mjs`:
- `EMPNO_CASES` 배열 전체를 지운다

`test/normalize.test.mjs`:
- `[브라우저] 사번 정규화` / `[서버] 사번 정규화` 두 테스트를 지운다
- import 에서 `normalizeEmpNo` 와 `EMPNO_CASES` 를 뺀다
- 두 구현 비교 테스트(`두 구현이 같은 입력에 같은 답을 낸다`)에서 `normalizeEmpNo` 비교 줄을 뺀다

Run: `npm test`
Expected: FAIL — `normalizeEmpNo_ is not defined` 등, 아직 호출부가 남아 있다. **정상이다.**
다음 스텝이 호출부를 바꾼다.

- [ ] **Step 2: 기계적 개명**

식별자를 일괄 치환한다. 문구("사번")는 Task 3 에서 다루므로 **여기서는 식별자만** 바꾼다.

```bash
cd /home/hr/etri-network-farewell-2609
node -e '
const fs=require("fs"), path=require("path");
const MAP=[
  ["normalizeEmpNo_","normalizeEmail_"],["normalizeEmpNo","normalizeEmail"],
  ["SAME_NAME_DIFF_EMPNO","SAME_NAME_DIFF_EMAIL"],["SAME_EMPNO_DIFF_NAME","SAME_EMAIL_DIFF_NAME"],
  ["findAnyByEmpNo_","findAnyByEmail_"],["findByEmpNo_","findByEmail_"],
  ["BAD_EMPNO","BAD_EMAIL"],["COL.EMPNO","COL.EMAIL"],["EMPNO:","EMAIL:"],
  ["empNo","email"],
];
function walk(d,out=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,e.name);
  if(e.isDirectory()){ if(!/node_modules|\.git|\.superpowers/.test(p)) walk(p,out); }
  else if(/\.(mjs|js|gs|html)$/.test(e.name)) out.push(p);
} return out;}
let n=0;
for(const f of [...walk("assets"),...walk("test"),...walk("apps-script"),"index.html","admin.html","test.html"]){
  const b=fs.readFileSync(f,"utf8"); let a=b;
  for(const [x,y] of MAP) a=a.split(x).join(y);
  if(a!==b){fs.writeFileSync(f,a); n++;}
}
console.log("개명 적용 파일: "+n);
'
```

`empNo` 를 **마지막**에 두는 이유: 앞의 항목들이 `empNo` 를 부분 문자열로 포함하므로,
순서가 바뀌면 `findByEmpNo_` 가 `findByemail_` 이라는 엉뚱한 이름이 된다.

Step 1 에서 정의를 이미 지웠으므로, 여기서 `normalizeEmpNo_` → `normalizeEmail_` 치환은
**호출부만** 바꾼다 — 정의가 둘 생기지 않는다.

- [ ] **Step 3: 시트 헤더 상수 수정**

`test/harness/load-code-gs.mjs` 의 `HEADER_RESPONSES` 첫 항목이 `'email'` 인지 확인한다
(Step 1 의 치환으로 이미 바뀌었어야 한다).

`apps-script/Code.gs` 의 `EXPECTED_HEADER_` (있다면) 도 같은지 확인한다.

- [ ] **Step 4: 테스트 픽스처의 값을 이메일로 교체**

모든 테스트에서 사번 값(`'01234'`, `'00777'`, `'01111'`, `'02222'` …)을 이메일 아이디로 바꾼다.
**기대값도 함께** 바꿔야 한다 — 예를 들어 `'1234'` 를 넣고 `'01234'` 가 나오길 기대하던 자리는
`'abc'` 를 넣고 `'abc@etri.re.kr'` 이 나오길 기대하도록 바뀐다.

권장 대응표 (일관되게만 쓰면 값 자체는 무엇이든 좋다):

| 옛 사번 | 새 입력 | 새 기대값 |
|---|---|---|
| `'01234'` / `'1234'` | `'hong'` | `'hong@etri.re.kr'` |
| `'00777'` | `'kim'` | `'kim@etri.re.kr'` |
| `'01111'` | `'lee'` | `'lee@etri.re.kr'` |
| `'02222'` | `'park'` | `'park@etri.re.kr'` |
| `'33333'` | `'choi'` | `'choi@etri.re.kr'` |
| `'44444'` | `'jung'` | `'jung@etri.re.kr'` |
| `'55555'` | `'kang'` | `'kang@etri.re.kr'` |
| `'06666'` | `'yoon'` | `'yoon@etri.re.kr'` |
| `'07777'` | `'seo'` | `'seo@etri.re.kr'` |
| `'08888'` | `'bae'` | `'bae@etri.re.kr'` |
| `'00042'` | `'ohyoung'` | `'ohyoung@etri.re.kr'` |
| `'99999'` / `'09999'` | `'nobody'` | `'nobody@etri.re.kr'` |

**시나리오 3 은 내용이 바뀐다.** 지금은 "앞의 0을 뺀 사번이 같은 행으로 모인다" 인데,
"`abc` 와 `abc@etri.re.kr` 과 `ABC` 가 같은 행으로 모인다" 로 바꾼다. 이번 변경의 핵심을
지키는 시나리오다:

```js
test('시나리오 3: 아이디·대문자·전체 이메일이 같은 행으로 모인다', () => {
  const s = fresh();
  s.call({ action: 'save', email: 'park', name: '이서연', pw: '2222', pickA: true, pickB: false });
  s.call({ action: 'save', email: 'PARK', name: '이서연', pw: '2222', pickA: false, pickB: true });
  s.call({ action: 'save', email: 'park@etri.re.kr', name: '이서연', pw: '2222', pickA: true, pickB: true });
  assert.equal(s.rows().length, 1, '세 번 다 같은 사람이어야 한다');
  assert.equal(s.rows()[0][0], 'park@etri.re.kr');
  assert.equal(s.call({ action: 'adminData', adminPw: ADMIN }).data.stats.total, 1);
});
```

108명 테스트의 사번 생성(`String(i).padStart(5,'0')`)도 바꾼다:

```js
    const email = 'user' + i;
```

- [ ] **Step 5: 형식 오류 테스트의 기대 코드 확인**

`BAD_EMPNO` → `BAD_EMAIL` 로 바뀌었을 것이다. 잘못된 입력값도 이메일 기준으로 바꾼다:
`'123456'`(6자리 사번) 같은 값은 이제 **유효한 아이디**이므로 오류가 아니다.
오류를 내는 값으로 `'가나다'` 또는 `''` 를 쓴다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 106 전후 (사번 케이스 2개가 빠지고 이메일 케이스가 들어와 수가 소폭 변한다). 실제 수를 보고할 것

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat!: 로그인 신원을 사번에서 이메일로 교체"
```

---

## Task 3: 화면 문구

**Files:**
- Modify: `index.html`, `assets/app.js`, `admin.html`, `assets/admin.js`, `test.html`

**Interfaces:**
- Consumes: `normalizeEmail` (Task 1), `EMAIL_DOMAIN` (`assets/config.js`)
- Produces: 없음

- [ ] **Step 1: `index.html` 의 로그인 칸 수정**

사번 입력 칸을 이렇게 바꾼다:

```html
    <label for="f-email">이메일 아이디</label>
    <input id="f-email" type="text" inputmode="email" autocomplete="off"
           maxlength="80" placeholder="예: hong  (또는 hong@etri.re.kr)">
    <div class="hint" id="hint-email">@etri.re.kr 은 빼고 아이디만 쓰셔도 됩니다.</div>
```

`inputmode="numeric"` 을 `inputmode="email"` 로 바꾸는 것이 핵심이다 — 더 이상 숫자가 아니다.
비밀번호 칸의 `inputmode="numeric"` 은 **그대로 둔다** (숫자 4자리 유지).

확인 화면(3단계)의 행 머리글 `사번` 을 `이메일` 로 바꾼다.

- [ ] **Step 2: `assets/app.js` 의 힌트 로직 수정**

`EMAIL_DOMAIN` 을 import 에 추가하고, 힌트 핸들러를 이렇게 바꾼다:

```js
const emailInput = $('f-email');
const hintEmail = $('hint-email');
const HINT_IDLE = `@${EMAIL_DOMAIN} 은 빼고 아이디만 쓰셔도 됩니다.`;

emailInput.addEventListener('input', () => {
  const raw = emailInput.value;
  if (raw.trim() === '') {
    hintEmail.className = 'hint';
    hintEmail.textContent = HINT_IDLE;
    return;
  }
  const norm = normalizeEmail(raw);
  if (norm) {
    hintEmail.className = 'hint ok';
    hintEmail.textContent = `${norm} 으로 조회합니다`;
  } else {
    hintEmail.className = 'hint bad';
    hintEmail.textContent = '아이디는 영문·숫자와 . _ - + 만 쓸 수 있습니다.';
  }
});
```

`doLogin` 의 형식 검증 문구도 바꾼다:

```js
  if (!email) return showErr('login-err', '이메일 아이디를 확인해주세요.');
```

`[처음으로]` 버튼이 힌트를 되돌리는 곳도 `HINT_IDLE` 을 쓰도록 바꾼다.

- [ ] **Step 3: `admin.html` / `assets/admin.js` 라벨 수정**

- 대리 입력 폼의 `사번` 라벨 → `이메일 아이디`, `placeholder` → `예: hong`
- `maxlength="7"` → `maxlength="80"`
- `admin.js` 의 표 머리글 배열에서 `'사번'` → `'이메일'`
- 경고 문구에서 "사번" 을 "이메일" 로 (`renderWarnings` 안의 두 문장)
- 확인 대화상자 문구의 "사번" → "이메일"

- [ ] **Step 4: `test.html` 의 헤더 안내 수정**

`headerOk` 실패 시 안내에 `empNo` 가 적혀 있으면 `email` 로 바꾼다.

- [ ] **Step 5: 기존 테스트가 깨지지 않았는지 확인**

Run: `npm test`
Expected: PASS — Task 2 와 같은 수 (화면 코드는 단위 테스트 대상이 아니다)

- [ ] **Step 6: 브라우저에서 확인**

Run: `npm run serve` 후 `http://localhost:8080/`

가능하면 헤드리스 크롬을 CDP 로 몰아 확인한다 (이 저장소에서 이전에 성공한 방법이다).
확인할 것:
- `hong` 입력 → 힌트가 초록색 「hong@etri.re.kr 으로 조회합니다」
- `HONG@ETRI.RE.KR` 입력 → 같은 초록색 힌트
- `가나다` 입력 → 빨간 경고
- 빈 칸 → 회색 안내 문구
- 콘솔 오류 없음

**무엇으로 어떻게 확인했는지 보고서에 정확히 적을 것.**

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: 화면 문구를 사번에서 이메일 아이디로"
```

---

## Task 4: 퇴직자별 표 복사

**Files:**
- Create: `assets/table.js`
- Create: `test/table.test.mjs`
- Modify: `admin.html`, `assets/admin.js`

**Interfaces:**
- Consumes: `RETIREES` (`assets/config.js`)
- Produces:
  - `buildTable(rows, retirees, filterKey) → string` — 탭 구분 표 텍스트. `filterKey` 는 `null`(전체) 또는 `'A'` / `'B'`
  - `countFor(rows, filterKey) → number`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/table.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTable, countFor } from '../assets/table.js';

const RETIREES = [{ key: 'A', label: '김 박사님' }, { key: 'B', label: '황 박사님' }];

const ROWS = [
  { email: 'a@etri.re.kr', name: '가나', pickA: true,  pickB: true,  updatedAt: '2026-08-14T01:00:00.000Z' },
  { email: 'b@etri.re.kr', name: '나다', pickA: true,  pickB: false, updatedAt: '2026-08-14T02:00:00.000Z' },
  { email: 'c@etri.re.kr', name: '다라', pickA: false, pickB: true,  updatedAt: '2026-08-14T03:00:00.000Z' },
  { email: 'd@etri.re.kr', name: '라마', pickA: false, pickB: false, updatedAt: '2026-08-14T04:00:00.000Z' },
];

test('전체 표는 헤더 + 모든 행', () => {
  const lines = buildTable(ROWS, RETIREES, null).split('\n');
  assert.equal(lines.length, 5, '헤더 1 + 행 4');
  assert.deepEqual(lines[0].split('\t'), ['이메일', '이름', '김 박사님', '황 박사님', '최종수정']);
  assert.deepEqual(lines[1].split('\t'), ['a@etri.re.kr', '가나', 'O', 'O', '2026-08-14']);
  assert.deepEqual(lines[4].split('\t'), ['d@etri.re.kr', '라마', '', '', '2026-08-14']);
});

test('A 필터는 pickA 인 행만 남긴다', () => {
  const lines = buildTable(ROWS, RETIREES, 'A').split('\n');
  assert.equal(lines.length, 3, '헤더 1 + 행 2');
  assert.deepEqual(lines.slice(1).map((l) => l.split('\t')[0]), ['a@etri.re.kr', 'b@etri.re.kr']);
});

test('B 필터는 pickB 인 행만 남긴다', () => {
  const lines = buildTable(ROWS, RETIREES, 'B').split('\n');
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.slice(1).map((l) => l.split('\t')[0]), ['a@etri.re.kr', 'c@etri.re.kr']);
});

test('필터를 걸어도 퇴직자 두 칸을 모두 남긴다', () => {
  // A 명단만 봐도 "이 사람은 두 분 다 하는구나"가 보여야 한다.
  const lines = buildTable(ROWS, RETIREES, 'A').split('\n');
  assert.deepEqual(lines[1].split('\t').slice(2, 4), ['O', 'O']);
  assert.deepEqual(lines[2].split('\t').slice(2, 4), ['O', '']);
});

test('빈 결과여도 헤더는 남는다', () => {
  const lines = buildTable([], RETIREES, null).split('\n');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].split('\t')[0], '이메일');
});

test('countFor 가 필터별 인원을 센다', () => {
  assert.equal(countFor(ROWS, null), 4);
  assert.equal(countFor(ROWS, 'A'), 2);
  assert.equal(countFor(ROWS, 'B'), 2);
  assert.equal(countFor([], 'A'), 0);
});

test('updatedAt 이 비어도 죽지 않는다', () => {
  const rows = [{ email: 'x@etri.re.kr', name: '마바', pickA: true, pickB: false, updatedAt: '' }];
  assert.equal(buildTable(rows, RETIREES, null).split('\n')[1].split('\t')[4], '');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test test/table.test.mjs`
Expected: FAIL — `Cannot find module '../assets/table.js'`

- [ ] **Step 3: `assets/table.js` 구현**

```js
/**
 * 관리자 화면의 표를 탭 구분 텍스트로 만든다.
 *
 * DOM 을 건드리지 않는 순수 함수다 — admin.js 는 최상위에서 document 를 만지므로
 * Node 에서 import 할 수 없다. 표를 만드는 로직만 여기 떼어두면 브라우저 없이 검증되고,
 * 세 개의 복사 버튼이 같은 코드 경로를 쓴다는 것도 구조로 보장된다.
 */

/** filterKey: null 이면 전체, 'A'/'B' 면 그 퇴직자를 선택한 행만. */
function pick(row, key) {
  return key === 'A' ? !!row.pickA : !!row.pickB;
}

function filterRows(rows, filterKey) {
  if (!filterKey) return rows.slice();
  return rows.filter((r) => pick(r, filterKey));
}

export function countFor(rows, filterKey) {
  return filterRows(rows, filterKey).length;
}

export function buildTable(rows, retirees, filterKey) {
  const header = ['이메일', '이름', retirees[0].label, retirees[1].label, '최종수정'];
  const body = filterRows(rows, filterKey).map((r) => [
    r.email,
    r.name,
    r.pickA ? 'O' : '',
    r.pickB ? 'O' : '',
    (r.updatedAt || '').slice(0, 10),
  ]);
  return [header, ...body].map((cols) => cols.join('\t')).join('\n');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — Task 3 대비 +7

- [ ] **Step 5: `admin.html` 에 버튼 두 개 추가**

`btn-copy` 줄을 이렇게 바꾼다:

```html
      <div class="row-btns">
        <button id="btn-copy" class="ghost">전체 표 복사</button>
        <button id="btn-copy-A" class="ghost">A 참여자 표</button>
        <button id="btn-copy-B" class="ghost">B 참여자 표</button>
      </div>
      <p class="muted" id="copied" hidden>클립보드에 담았습니다. 엑셀에 붙여넣으세요.</p>
```

버튼 글자는 `admin.js` 가 실제 퇴직자 이름과 인원수로 바꿔 넣는다.

- [ ] **Step 6: `assets/admin.js` 연결**

import 에 추가:

```js
import { buildTable, countFor } from './table.js';
```

기존 `btn-copy` 핸들러를 지우고 아래로 대체한다:

```js
/* ---------- 표 복사 ---------- */

const COPY_BUTTONS = [
  { id: 'btn-copy', filterKey: null },
  { id: 'btn-copy-A', filterKey: 'A' },
  { id: 'btn-copy-B', filterKey: 'B' },
];

async function toClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
}

function copyLabel(filterKey) {
  const n = countFor(lastRows, filterKey);
  if (!filterKey) return `전체 표 복사 (${n})`;
  const r = RETIREES.find((x) => x.key === filterKey);
  return `${r.label} 참여자 표 (${n})`;
}

function refreshCopyButtons() {
  for (const b of COPY_BUTTONS) {
    const el = $(b.id);
    el.textContent = copyLabel(b.filterKey);
    // 낡은 표를 메일 수신자 목록으로 쓰면 안 된다. 0명이면 헤더만 복사할 이유가 없다.
    el.disabled = stale || countFor(lastRows, b.filterKey) === 0;
  }
}

for (const b of COPY_BUTTONS) {
  $(b.id).addEventListener('click', async () => {
    if (stale) return;
    if (countFor(lastRows, b.filterKey) === 0) return;
    await toClipboard(buildTable(lastRows, RETIREES, b.filterKey));
    $('copied').hidden = false;
  });
}
```

`setStale` 안에서 `$('btn-copy').disabled = isStale;` 을 지우고 `refreshCopyButtons();` 로 바꾼다.
`render()` 끝에서도 `refreshCopyButtons();` 를 부른다 (인원수가 갱신되어야 한다).
`lastRows` 와 `stale` 이 선언된 **뒤**에 이 블록이 오도록 위치를 확인한다.

- [ ] **Step 7: 기존 테스트가 깨지지 않았는지 확인**

Run: `npm test`
Expected: PASS — Step 4 와 같은 수

- [ ] **Step 8: 브라우저에서 확인**

`npm run serve` + 헤드리스 크롬(CDP)으로 `adminData` 응답을 목으로 넣어 확인한다:
- 세 버튼의 글자에 실제 퇴직자 이름과 인원수가 들어간다
- `A 참여자 표` 를 누르면 pickA 인 행만 클립보드에 담긴다
- 0명인 버튼은 눌리지 않는다
- `stale` 상태에서 세 버튼 모두 막힌다
- 콘솔 오류 없음

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "feat: 퇴직자별 참여자 표 복사"
```

---

## Task 5: 문서 갱신과 재배포 준비

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-12-farewell-gift-survey-design.md` (머리에 한 줄만)

**Interfaces:**
- Consumes: 전부
- Produces: 담당자가 따라 할 수 있는 재배포 절차

- [ ] **Step 1: `README.md` 의 시트 준비 절차 수정**

- `responses` 헤더 첫 칸을 `empNo` → `email` 로
- **A열 텍스트 서식 지정 안내를 삭제한다** (이메일은 서식과 무관하다). 그 자리에
  이 한 줄을 넣는다: `> 사번을 쓰던 시절 필요했던 A열 텍스트 서식 지정은 더 이상 필요 없습니다.`

- [ ] **Step 2: `README.md` 에 재배포 절차 추가**

「배포 순서」 아래에 새 절이 들어간다:

```markdown
## 이미 배포한 뒤 코드를 고쳤다면

순서를 지켜야 한다. 2번을 빠뜨리면 화면은 새 것인데 서버가 옛 것이라 모든 요청이 실패한다.

1. **구글시트** — 헤더나 열의 뜻이 바뀌었으면 먼저 고친다
2. **Apps Script** — `apps-script/Code.gs` 를 다시 붙여넣고
   **배포 → 배포 관리 → 편집(연필) → 버전: 새 버전 → 배포**
   (저장만 해서는 `/exec` 주소의 내용이 바뀌지 않는다)
3. **GitHub** — `git push` (Pages 가 몇 분 안에 갱신된다)
4. **확인** — `test.html` 을 열어 `headerOk` 가 OK 인지 본다. 1번을 빠뜨렸으면 여기서 잡힌다
   (브라우저가 옛 파일을 캐시하고 있으면 `Ctrl+Shift+R`)
```

- [ ] **Step 3: 최초 설계 문서에 대체 표시**

`docs/superpowers/specs/2026-08-12-farewell-gift-survey-design.md` 의 머리(상태 줄 아래)에
한 줄 추가한다. 문서 본문은 **고치지 않는다** — 역사 기록으로 남긴다.

```markdown
> **신원 모델은 이 문서 이후 바뀌었다.** 사번 대신 회사 이메일을 쓴다.
> [2026-08-13 신원 모델 변경 설계](2026-08-13-email-identity-change-design.md)가 이 문서의
> §2(사번 관련)·§3 A열·§4 사번 정규화·§6.1 로그인 화면을 대체한다. 나머지는 유효하다.
```

- [ ] **Step 4: 전체 테스트와 최종 점검**

Run: `npm test`
Expected: PASS — Task 4 와 같은 수, 출력 깨끗

Run: `git status --short`
Expected: 비어 있음 (모두 커밋됨)

`명단.md` 가 여전히 추적되지 않는지 확인:

Run: `git ls-files | grep 명단 || echo "추적 안 됨"`
Expected: `추적 안 됨`

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "docs: 이메일 신원으로 바뀐 배포 절차"
```

---

## 완료 기준

- [ ] `npm test` 전부 통과, 출력 깨끗
- [ ] `abc` / `ABC` / `abc@etri.re.kr` 이 한 행으로 모이는 시나리오 테스트가 있다
- [ ] 브라우저에서 힌트가 `hong@etri.re.kr` 을 실시간으로 보여준다
- [ ] 관리자 화면에 복사 버튼 3개가 인원수와 함께 뜨고, `stale` 에서 전부 막힌다
- [ ] 코드·테스트에 `empNo` 가 하나도 남지 않았다 (`grep -r empNo assets apps-script test *.html`)
- [ ] `README.md` 를 따라가면 재배포할 수 있다
- [ ] `git status` 에 `명단.md` 가 없다
