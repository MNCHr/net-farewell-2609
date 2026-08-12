import { EXEC_URL, RETIREES } from './config.js';
import { createApi } from './api.js';
import { normalizeEmpNo, normalizeName } from './normalize.js';

const api = createApi({ execUrl: EXEC_URL });
const $ = (id) => document.getElementById(id);

let adminPw = '';       // 메모리에만 둔다. 저장하지 않는다.
let lastRows = [];

function showErr(id, msg) { const b = $(id); b.textContent = msg; b.hidden = false; }
function clearErr(id) { $(id).hidden = true; }

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

async function refresh() {
  clearErr('list-err');
  const res = await api.send({ action: 'adminData', adminPw });
  if (!res.ok) return showErr('list-err', res.message || '오류가 발생했습니다.');
  render(res.data);
}
$('btn-refresh').addEventListener('click', refresh);

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
    d.textContent = w.type === 'SAME_NAME_DIFF_EMPNO'
      ? `‘${w.name}’ 님이 사번 ${w.empNos.join(' / ')} 로 두 건 있습니다. 사번 오타일 수 있습니다.`
      : `사번 ${w.empNo} 에 이름이 ${w.names.join(' / ')} 로 다르게 기록돼 있습니다.`;
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
      r.empNo,
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
  if (!confirm(`${r.name}(${r.empNo}) 님의 비밀번호를 초기화합니다.\n`
             + '다음 로그인 때 입력하는 비밀번호가 새 비밀번호가 됩니다. 계속할까요?')) return;
  const res = await api.send({ action: 'adminResetPw', adminPw, empNo: r.empNo });
  if (!res.ok) return showErr('list-err', res.message);
  refresh();
}

async function del(r) {
  if (!confirm(`${r.name}(${r.empNo}) 님의 응답을 삭제합니다.\n`
             + '집계에서 빠지지만 시트에는 기록이 남습니다. 계속할까요?')) return;
  const res = await api.send({ action: 'adminDelete', adminPw, empNo: r.empNo });
  if (!res.ok) return showErr('list-err', res.message);
  refresh();
}

function loadIntoUpsert(r) {
  $('u-empno').value = r.empNo;
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

$('btn-upsert').addEventListener('click', async () => {
  clearErr('u-err');
  const empNo = normalizeEmpNo($('u-empno').value);
  const name = normalizeName($('u-name').value);
  if (!empNo) return showErr('u-err', '사번은 숫자 5자리입니다.');
  if (!name) return showErr('u-err', '이름을 입력해주세요.');

  const res = await api.send({
    action: 'adminUpsert', adminPw, empNo, name,
    pickA: $('up-A').checked, pickB: $('up-B').checked,
  });
  if (!res.ok) return showErr('u-err', res.message);

  $('u-empno').value = ''; $('u-name').value = '';
  $('up-A').checked = false; $('up-B').checked = false;
  refresh();
});

/* ---------- 표 복사 ---------- */

$('btn-copy').addEventListener('click', async () => {
  const header = ['사번', '이름', RETIREES[0].label, RETIREES[1].label, '최종수정'].join('\t');
  const body = lastRows.map((r) => [
    r.empNo, r.name, r.pickA ? 'O' : '', r.pickB ? 'O' : '', r.updatedAt,
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
