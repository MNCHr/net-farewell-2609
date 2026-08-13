import { EXEC_URL, RETIREES } from './config.js';
import { createApi } from './api.js';
import { normalizeEmail, normalizeName } from './normalize.js';

const api = createApi({ execUrl: EXEC_URL });
const $ = (id) => document.getElementById(id);

let adminPw = '';       // 메모리에만 둔다. 저장하지 않는다.
let lastRows = [];
let stale = false;      // 쓰기는 성공했는데 새로고침이 실패해, 화면이 최신인지 보장 못하는 상태.

function showErr(id, msg) { const b = $(id); b.textContent = msg; b.hidden = false; }
function clearErr(id) { $(id).hidden = true; }

/**
 * 쓰기 성공 뒤 새로고침이 실패하면 표를 그대로 두되, 최신이 아닐 수 있다고 밝히고
 * 복사와 저장을 막는다 — 최신인지 모르는 화면은 표 복사(정산)의 근거도, 저장 확인창
 * (겹침 판정)의 근거도 될 수 없다. message 는 실패한 새로고침의 res.message — 있으면
 * 배너 안에 이유로 얹는다. 화면에는 항상 이 배너 하나만 있어야 하므로, 여기서 지우고
 * 여기서만 채운다.
 */
function setStale(isStale, message) {
  stale = isStale;
  $('stale-banner').hidden = !isStale;
  $('stale-reason').textContent = (isStale && message) ? `새로고침이 실패한 이유: ${message}` : '';
  $('btn-copy').disabled = isStale;
  $('btn-upsert').disabled = isStale;
}

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

/**
 * 목록을 다시 불러온다. { ok, message } 를 돌려준다 — 실패하면 message 에 서버 사유가 실린다
 * (호출자가 그걸 배너에 실을 수도, 버릴 수도 있다).
 * reportError=false 로 부르면(쓰기 성공 뒤 후속 새로고침) list-err 에는 띄우지 않는다 —
 * 그 자리는 "이 작업 자체가 실패했다"는 뜻으로 쓰이므로, 성공한 작업을 실패로 오인하게 만들면 안 된다.
 * 그 경우 호출자가 setStale(true, message) 로 별도의 배너를 띄운다.
 */
async function refresh({ reportError = true } = {}) {
  clearErr('list-err');
  const res = await api.send({ action: 'adminData', adminPw });
  if (!res.ok) {
    if (reportError) showErr('list-err', res.message || '오류가 발생했습니다.');
    return { ok: false, message: res.message };
  }
  render(res.data);
  setStale(false);
  return { ok: true };
}
$('btn-refresh').addEventListener('click', () => refresh());
$('btn-stale-retry').addEventListener('click', () => refresh());

/** 쓰기(수정/삭제/저장)가 성공한 뒤 호출한다. 후속 새로고침이 실패하면 stale 배너로 알린다. */
async function refreshAfterWrite() {
  const res = await refresh({ reportError: false });
  if (!res.ok) setStale(true, res.message);
}

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
    d.textContent = w.type === 'SAME_NAME_DIFF_EMAIL'
      ? `‘${w.name}’ 님이 사번 ${w.emails.join(' / ')} 로 두 건 있습니다. 사번 오타일 수 있습니다.`
      : `사번 ${w.email} 에 이름이 ${w.names.join(' / ')} 로 다르게 기록돼 있습니다.`;
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
      r.email,
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
  if (!confirm(`${r.name}(${r.email}) 님의 비밀번호를 초기화합니다.\n`
             + '다음 로그인 때 입력하는 비밀번호가 새 비밀번호가 됩니다. 계속할까요?')) return;
  const res = await api.send({ action: 'adminResetPw', adminPw, email: r.email });
  if (!res.ok) return showErr('list-err', res.message);
  await refreshAfterWrite();
}

async function del(r) {
  if (!confirm(`${r.name}(${r.email}) 님의 응답을 삭제합니다.\n`
             + '집계에서 빠지지만 시트에는 기록이 남습니다. 계속할까요?')) return;
  const res = await api.send({ action: 'adminDelete', adminPw, email: r.email });
  if (!res.ok) return showErr('list-err', res.message);
  await refreshAfterWrite();
}

function loadIntoUpsert(r) {
  $('u-empno').value = r.email;
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

/** email 는 이미 normalizeEmail 를 거친 값이어야 한다 — lastRows 의 email 도 정규화돼 있다. */
function findExistingRow(email) {
  return lastRows.find((r) => r.email === email) || null;
}

function pickText(pickA, pickB) {
  const picks = [];
  if (pickA) picks.push(RETIREES[0].label);
  if (pickB) picks.push(RETIREES[1].label);
  return picks.length ? picks.join(', ') : '없음';
}

/**
 * 저장 전 확인창. 사번이 기존 응답과 겹치면 "덮어쓴다"는 사실과 기존/변경 후 선택을
 * 나란히 보여준다 — 대리 입력 중 사번 오타로 남의 응답을 지우는 사고를 여기서 잡기 위해서다.
 * 겹치지 않으면 정규화된 사번·이름으로 새로 추가된다는 점을 보여준다(01234 vs 1234 오인 방지).
 */
function confirmUpsert(email, name, pickA, pickB) {
  const existing = findExistingRow(email);
  if (existing) {
    return confirm(
      `${existing.name}(${email}) 님의 기존 응답을 덮어씁니다.\n`
      + `기존: ${pickText(existing.pickA, existing.pickB)}\n`
      + `변경 후: ${name} 님, ${pickText(pickA, pickB)}\n`
      + '계속할까요?'
    );
  }
  return confirm(`사번 ${email}, 이름 ${name} 으로 새 응답을 추가합니다.\n계속할까요?`);
}

function showSaved(created) {
  const p = $('u-saved');
  p.textContent = created ? '새 응답으로 저장했습니다.' : '기존 응답을 수정했습니다.';
  p.hidden = false;
}

$('btn-upsert').addEventListener('click', async () => {
  // 최신 상태가 아닐 수 있는 lastRows 를 근거로 겹침을 판정해 저장하면 안 된다 — 표 복사와
  // 같은 이유. 버튼을 disabled 로 두는 것과 별개로, 여기서도 독립적으로 막는다.
  if (stale) return showErr('u-err', '목록을 다시 불러오지 못해 최신 상태인지 알 수 없어 저장을 막았습니다. 위 배너의 다시 불러오기를 누른 뒤 다시 시도해주세요.');
  clearErr('u-err');
  $('u-saved').hidden = true;
  const email = normalizeEmail($('u-empno').value);
  const name = normalizeName($('u-name').value);
  if (!email) return showErr('u-err', '사번은 숫자 5자리입니다.');
  if (!name) return showErr('u-err', '이름을 입력해주세요.');

  const pickA = $('up-A').checked;
  const pickB = $('up-B').checked;
  if (!confirmUpsert(email, name, pickA, pickB)) return;

  const res = await api.send({ action: 'adminUpsert', adminPw, email, name, pickA, pickB });
  if (!res.ok) return showErr('u-err', res.message);

  $('u-empno').value = ''; $('u-name').value = '';
  $('up-A').checked = false; $('up-B').checked = false;
  showSaved(res.data.created);
  await refreshAfterWrite();
});

/* ---------- 표 복사 ---------- */

$('btn-copy').addEventListener('click', async () => {
  if (stale) return; // 최신 상태가 아닐 수 있는 표를 정산 시트로 복사하면 안 된다.
  const header = ['사번', '이름', RETIREES[0].label, RETIREES[1].label, '최종수정'].join('\t');
  const body = lastRows.map((r) => [
    r.email, r.name, r.pickA ? 'O' : '', r.pickB ? 'O' : '', r.updatedAt,
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
