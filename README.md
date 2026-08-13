# 퇴임 선물 참여 조사

[설계 문서](docs/superpowers/specs/2026-08-12-farewell-gift-survey-design.md) · [구현 계획](docs/superpowers/plans/2026-08-12-farewell-gift-survey.md) ·
[이메일 신원 변경 설계](docs/superpowers/specs/2026-08-13-email-identity-change-design.md)

## ⚠️ 개인정보

이 저장소는 GitHub Pages 때문에 **공개**다. 실명·사번·연락처가 담긴 파일을
커밋하지 않는다. `명단.md` 등은 `.gitignore`에 등록되어 있다.
명단이 필요하면 관리자 개인 드라이브의 **비공개 구글시트**에만 둔다.

검색엔진 노출을 막는 건 `robots.txt`가 아니라 `index.html`/`admin.html`/`test.html`의
`<meta name="robots" content="noindex,nofollow">` 태그다. GitHub Pages 프로젝트 사이트
(`https://<계정>.github.io/<저장소>/`)에서는 크롤러가 `robots.txt`를 사용자 사이트 루트에서
찾기 때문에 이 저장소의 `robots.txt`는 실제로는 아무도 읽지 않는다 — 이 메타 태그가
**유일하게 실제로 동작하는 방어선**이다. 나중에 정리하면서 지우지 않는다.

## 배포 순서

### 1. 구글시트 (개인 gmail 계정으로)

회사 워크스페이스 계정은 「액세스: 모든 사용자」 배포가 정책으로 막힌 경우가 많다.
반드시 개인 계정을 쓴다.

1. 새 스프레드시트를 만든다
2. 시트 이름을 `responses` 로 바꾸고, 시트를 하나 더 추가해 `log` 로 이름 짓는다
3. `responses` 1행에 헤더를 넣는다:
   `email  name  pickA  pickB  pwHash  salt  createdAt  updatedAt  updatedBy  status  failCount  lockedUntil`
4. `log` 1행에 헤더를 넣는다: `at  action  email  actor  detail`

> 사번을 쓰던 시절 필요했던 A열 텍스트 서식 지정은 더 이상 필요 없습니다.

### 2. Apps Script

1. 확장 프로그램 → Apps Script
2. **프로젝트 설정 → 「Chrome V8 런타임 사용」이 켜져 있는지 확인한다.**
   구형 Rhino 런타임에서는 `String.prototype.normalize` 가 없어 이름 정규화가 죽는다
3. `apps-script/Code.gs` 내용을 전부 붙여넣는다
4. 함수 목록에서 `setupAdminPassword` 를 고르고, 코드 안의 `'CHANGE_ME'` 를
   실제 관리자 비밀번호로 바꾼 뒤 **한 번 실행**한다 (권한 승인 필요)

   > ⚠️ **이 수정은 반드시 Apps Script 편집기 화면 안에서만 한다.**
   > 로컬의 `apps-script/Code.gs` 파일은 이 단계에서 절대 고치지 않는다.
   > 이 저장소는 GitHub Pages 때문에 **공개**이며, 바로 다음 절(3. GitHub Pages)에서
   > 이 저장소를 그대로 push 한다. 방금 3단계에서 복사한 그 로컬 파일에 실제
   > 비밀번호를 써넣으면 그 push 한 번으로 관리자 비밀번호가 공개 저장소에 평문으로
   > 올라간다. 편집기 안의 사본과 로컬 파일은 서로 다른 텍스트다 — 편집기 쪽만
   > 고치고, 로컬 파일은 손대지 않은 채로 둔다.

5. 실행이 끝나면 **Apps Script 편집기 안에서** 코드의 비밀번호를 다시 `'CHANGE_ME'` 로
   되돌리고 저장한다 (로컬 `apps-script/Code.gs` 는 4단계에서 손대지 않았으므로
   원래부터 `'CHANGE_ME'` 그대로다 — 커밋 전에 한 번 확인해도 좋다)
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

## 관리자 화면

`admin.html`은 어디에도 링크되어 있지 않다 (일부러 그렇다). 주소창에 직접 입력해서 연다:

```
https://<계정>.github.io/<저장소>/admin.html
```

여기서 할 수 있는 일:

- 집계 보기, 오타 의심 항목(`SAME_NAME_DIFF_EMAIL` 등) 확인
- 비밀번호 초기화, 대리 입력
- 응답 삭제 — 시트에서 행을 지우는 게 아니라 `status`만 바꾸므로 되돌릴 수 있다
- **전체 표 복사** / **퇴직자별 표 복사** — 각 퇴직자에게 마음을 보탠 사람들에게 메일을 보낼 때
  쓴다. 엑셀에 붙여넣고 이메일 열만 긁으면 된다

## 이미 배포한 뒤 코드를 고쳤다면

순서를 지켜야 한다. 2번을 빠뜨리면 화면은 새 것인데 서버가 옛 것이라 모든 요청이 실패한다.

1. **구글시트** — 헤더나 열의 뜻이 바뀌었으면 먼저 고친다
2. **Apps Script** — `apps-script/Code.gs` 를 다시 붙여넣고
   **배포 → 배포 관리 → 편집(연필) → 버전: 새 버전 → 배포**
   (저장만 해서는 `/exec` 주소의 내용이 바뀌지 않는다)
3. **GitHub** — `git push` (Pages 가 몇 분 안에 갱신된다)
4. **확인** — `test.html` 을 열어 `headerOk` 가 OK 인지 본다. 1번을 빠뜨렸으면 여기서 잡힌다
   (브라우저가 옛 파일을 캐시하고 있으면 `Ctrl+Shift+R`)

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
