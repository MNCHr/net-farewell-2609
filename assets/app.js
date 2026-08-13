import { EXEC_URL, RETIREES, ORG_LABEL, EMAIL_DOMAIN } from './config.js';
import { createApi } from './api.js';
import { normalizeEmail, normalizeName, normalizePw } from './normalize.js';

const api = createApi({ execUrl: EXEC_URL });
const $ = (id) => document.getElementById(id);

const STEPS = ['step-intro', 'step-login', 'step-confirm', 'step-pick', 'step-done'];
function show(id) {
  STEPS.forEach((s) => { $(s).hidden = (s !== id); });
  window.scrollTo(0, 0);
}

/** 이 세 값이 화면 전체의 상태다. */
const session = { email: '', name: '', pw: '', picks: { A: false, B: false } };

/* ---------- 1단계 ---------- */
$('intro-sub').textContent =
  `${ORG_LABEL} ${RETIREES.map((r) => r.label).join(' · ')}의 퇴임을 앞두고 선물을 준비합니다.`;
$('btn-start').addEventListener('click', () => { show('step-login'); $('f-email').focus(); });
$('btn-back-intro').addEventListener('click', () => show('step-intro'));

/* ---------- 2단계 ---------- */
const emailInput = $('f-email');
const hintEmail = $('hint-email');
const HINT_IDLE = `@${EMAIL_DOMAIN} 은 빼고 아이디만 쓰셔도 됩니다.`;

// index.html 에는 도메인을 하드코딩하지 않는다 — EMAIL_DOMAIN(config.js) 이 유일한 출처다.
emailInput.placeholder = `예: hong  (또는 hong@${EMAIL_DOMAIN})`;
hintEmail.textContent = HINT_IDLE;

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

function showErr(boxId, message) {
  const box = $(boxId);
  box.textContent = message;
  box.hidden = false;
}
function clearErr(boxId) { $(boxId).hidden = true; }

async function doLogin() {
  clearErr('login-err');

  const email = normalizeEmail(emailInput.value);
  const name = normalizeName($('f-name').value);
  const pw = normalizePw($('f-pw').value);

  if (!email) return showErr('login-err', '이메일 아이디를 확인해주세요.');
  if (!name) return showErr('login-err', '이름을 입력해주세요.');
  if (!pw) return showErr('login-err', '비밀번호는 숫자 4자리입니다.');

  const btn = $('btn-login');
  btn.disabled = true;
  btn.textContent = '확인 중…';
  const res = await api.send({ action: 'auth', email, name, pw });
  btn.disabled = false;
  btn.textContent = '확인';

  if (!res.ok) return showErr('login-err', res.message || '오류가 발생했습니다.');

  session.email = res.data.email;
  session.name = res.data.name;
  session.pw = pw;
  session.picks = res.data.picks;

  if (res.data.mode === 'new') {
    $('c-email').textContent = session.email;
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
$('btn-confirm-no').addEventListener('click', () => { show('step-login'); emailInput.focus(); });
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
    email: session.email, name: session.name, pw: session.pw,
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
  session.email = ''; session.name = ''; session.pw = '';
  session.picks = { A: false, B: false };
  ['f-email', 'f-name', 'f-pw'].forEach((id) => { $(id).value = ''; });
  hintEmail.className = 'hint';
  hintEmail.textContent = HINT_IDLE;
  show('step-intro');
});

show('step-intro');
