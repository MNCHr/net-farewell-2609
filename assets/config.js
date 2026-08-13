/**
 * 운영 중 고칠 값은 전부 여기에만 둔다.
 *
 * EXEC_URL: Apps Script 배포 → 웹앱 URL. 반드시 /exec 로 끝나야 한다.
 *           /dev 로 끝나는 주소는 구글 로그인을 요구하므로 쓰면 안 된다.
 */
export const EXEC_URL = 'https://script.google.com/macros/s/AKfycbzlNRDGNyJt2XX3luxDfilGyGjtvP0BGaJTQwQgWWqsRlBZCPsdw9Q6R82zxU1BnheNLg/exec';

/** key 는 시트의 pickA/pickB 와 대응한다. 순서를 바꾸면 집계가 어긋난다. */
export const RETIREES = [
  { key: 'A', label: '김응하 박사님' },
  { key: 'B', label: '황정연 박사님' },
];

export const ORG_LABEL = '네트워크연구본부';

/**
 * 로그인 아이디에 붙일 회사 이메일 도메인. '@' 는 포함하지 않는다.
 * apps-script/Code.gs 의 EMAIL_DOMAIN 과 반드시 같아야 한다 —
 * 어긋나면 화면에 보이는 값과 실제 저장되는 값이 달라진다.
 */
export const EMAIL_DOMAIN = 'etri.re.kr';
