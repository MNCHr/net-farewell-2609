/**
 * 퇴임 선물 참여 조사 — 서버
 *
 * 이 파일이 정본이다. Apps Script 편집기에는 이 내용을 붙여넣어 쓴다.
 * 편집기에서 직접 고쳤다면 반드시 이 파일에도 되돌려 넣을 것.
 */

var SHEET_RESPONSES = 'responses';
var SHEET_LOG = 'log';
var NCOLS = 12;

/** responses 시트의 1-based 열 번호 */
var COL = {
  EMPNO: 1, NAME: 2, PICK_A: 3, PICK_B: 4, PW_HASH: 5, SALT: 6,
  CREATED: 7, UPDATED: 8, UPDATED_BY: 9, STATUS: 10, FAIL: 11, LOCKED: 12,
};

var MAX_FAIL = 5;
var LOCK_MINUTES = 10;
var LOCK_WAIT_MS = 30000;

/** 테스트가 교체할 수 있도록 시각 취득을 한 곳으로 모은다. */
function now_() {
  return new Date();
}

/** ===================== 정규화 =====================
 * assets/normalize.js 와 같은 규칙이다. 한쪽만 고치면 안 된다.
 */

var EMPNO_LENGTH = 5;
var PW_LENGTH = 4;
var NAME_MAX = 20;

var WS_RE_ = /[\s　​-‍﻿]/g;

function toHalfWidthDigits_(s) {
  return s.replace(/[０-９]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30);
  });
}

function normalizeEmpNo_(raw) {
  if (raw === null || raw === undefined) return null;
  var digits = toHalfWidthDigits_(String(raw)).replace(/[^0-9]/g, '');
  if (digits.length === 0 || digits.length > EMPNO_LENGTH) return null;
  while (digits.length < EMPNO_LENGTH) digits = '0' + digits;   // padStart 는 쓰지 않는다
  return digits;
}

function normalizeName_(raw) {
  if (raw === null || raw === undefined) return null;
  var cleaned = String(raw).normalize('NFC').replace(WS_RE_, '');
  if (cleaned.length === 0 || cleaned.length > NAME_MAX) return null;
  return cleaned;
}

function normalizePw_(raw) {
  if (raw === null || raw === undefined) return null;
  var s = toHalfWidthDigits_(String(raw)).replace(WS_RE_, '');
  if (!/^[0-9]{4}$/.test(s)) return null;
  return s;
}

function ok_(data) {
  return { ok: true, data: data };
}

function err_(code, message, extra) {
  var out = { ok: false, error: code, message: message };
  if (extra) {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
    }
  }
  return out;
}

function sheet_(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}

/** ===================== 저장소 ===================== */

function boolOf_(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1;
}

function rowFromValues_(values, rowIndex) {
  return {
    rowIndex: rowIndex,
    empNo: normalizeEmpNo_(values[COL.EMPNO - 1]) || String(values[COL.EMPNO - 1] || ''),
    name: String(values[COL.NAME - 1] || ''),
    pickA: boolOf_(values[COL.PICK_A - 1]),
    pickB: boolOf_(values[COL.PICK_B - 1]),
    pwHash: String(values[COL.PW_HASH - 1] || ''),
    salt: String(values[COL.SALT - 1] || ''),
    createdAt: String(values[COL.CREATED - 1] || ''),
    updatedAt: String(values[COL.UPDATED - 1] || ''),
    updatedBy: String(values[COL.UPDATED_BY - 1] || ''),
    status: String(values[COL.STATUS - 1] || 'active'),
    failCount: Number(values[COL.FAIL - 1] || 0),
    lockedUntil: String(values[COL.LOCKED - 1] || ''),
  };
}

function valuesFromRow_(row) {
  var v = [];
  v[COL.EMPNO - 1] = row.empNo;
  v[COL.NAME - 1] = row.name;
  v[COL.PICK_A - 1] = !!row.pickA;
  v[COL.PICK_B - 1] = !!row.pickB;
  v[COL.PW_HASH - 1] = row.pwHash || '';
  v[COL.SALT - 1] = row.salt || '';
  v[COL.CREATED - 1] = row.createdAt || '';
  v[COL.UPDATED - 1] = row.updatedAt || '';
  v[COL.UPDATED_BY - 1] = row.updatedBy || '';
  v[COL.STATUS - 1] = row.status || 'active';
  v[COL.FAIL - 1] = Number(row.failCount || 0);
  v[COL.LOCKED - 1] = row.lockedUntil || '';
  return v;
}

function readRows_() {
  var sh = sheet_(SHEET_RESPONSES);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i += 1) {          // 0행은 헤더
    if (!values[i] || String(values[i][COL.EMPNO - 1] || '') === '') continue;
    out.push(rowFromValues_(values[i], i + 1));          // 시트는 1-based
  }
  return out;
}

function findByEmpNo_(rows, empNo) {
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].empNo === empNo && rows[i].status === 'active') return rows[i];
  }
  return null;
}

function findAnyByEmpNo_(rows, empNo) {
  var out = [];
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].empNo === empNo) out.push(rows[i]);
  }
  return out;
}

function blankRow_(empNo, name) {
  var iso = now_().toISOString();
  return {
    rowIndex: 0, empNo: empNo, name: name,
    pickA: false, pickB: false, pwHash: '', salt: '',
    createdAt: iso, updatedAt: iso, updatedBy: 'self',
    status: 'active', failCount: 0, lockedUntil: '',
  };
}

function appendRow_(row) {
  var sh = sheet_(SHEET_RESPONSES);
  sh.appendRow(valuesFromRow_(row));
  row.rowIndex = sh.getLastRow();
  return row;
}

function writeRow_(row) {
  var sh = sheet_(SHEET_RESPONSES);
  sh.getRange(row.rowIndex, 1, 1, NCOLS).setValues([valuesFromRow_(row)]);
  return row;
}

function writeLog_(action, empNo, actor, detail) {
  var sh = sheet_(SHEET_LOG);
  if (!sh) return;
  sh.appendRow([now_().toISOString(), action, empNo, actor, detail || '']);
}

/** 시트 읽기-수정-쓰기 사이에 다른 요청이 끼어들면 행이 덮어써진다. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return err_('BUSY', '접속이 몰리고 있습니다. 잠시 후 다시 시도해주세요.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** ===================== 해시 ===================== */

function sha256Base64_(s) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function newSalt_() {
  return Utilities.getUuid();
}

function hashPw_(salt, pw) {
  return sha256Base64_(String(salt) + '|' + String(pw));
}

/** ===================== 인증 ===================== */

function checkLock_(row) {
  if (!row.lockedUntil) return null;
  var until = new Date(row.lockedUntil);
  if (now_().getTime() < until.getTime()) {
    return err_('LOCKED',
      '비밀번호를 여러 번 잘못 입력해 잠겼습니다. 잠시 후 다시 시도해주세요.',
      { lockedUntil: row.lockedUntil });
  }
  // 잠금이 지났다 — 카운터를 되돌린다.
  row.failCount = 0;
  row.lockedUntil = '';
  writeRow_(row);
  return null;
}

function registerFailure_(row) {
  row.failCount = Number(row.failCount || 0) + 1;
  if (row.failCount >= MAX_FAIL) {
    row.lockedUntil = new Date(now_().getTime() + LOCK_MINUTES * 60000).toISOString();
    writeRow_(row);
    return err_('LOCKED',
      '비밀번호를 ' + MAX_FAIL + '회 잘못 입력해 ' + LOCK_MINUTES + '분간 잠겼습니다.',
      { lockedUntil: row.lockedUntil });
  }
  writeRow_(row);
  return err_('WRONG_PW', '비밀번호가 일치하지 않습니다.',
    { remaining: MAX_FAIL - row.failCount });
}

function clearFailure_(row) {
  if (Number(row.failCount || 0) !== 0 || row.lockedUntil) {
    row.failCount = 0;
    row.lockedUntil = '';
    writeRow_(row);
  }
}

/**
 * 자격 판정. 성공하면 { row, mode, empNo, name, pw }, 실패하면 오류 응답을 돌려준다.
 * 반환값에 .ok 가 있으면 오류다.
 *
 * 이 함수는 절대 스스로 락을 잡지 않는다. 호출자(handleAuth_/handleSave_)가
 * 이미 withLock_ 안에 있기 때문이며, 여기서 또 잡으면 중첩 획득이 된다.
 */
function verifyCredentials_(req) {
  var empNo = normalizeEmpNo_(req.empNo);
  if (!empNo) return err_('BAD_EMPNO', '사번은 숫자 5자리입니다. 다시 확인해주세요.');

  var name = normalizeName_(req.name);
  if (!name) return err_('BAD_NAME', '이름을 입력해주세요.');

  var pw = normalizePw_(req.pw);
  if (!pw) return err_('BAD_PW', '비밀번호는 숫자 4자리입니다.');

  var rows = readRows_();
  var row = findByEmpNo_(rows, empNo);

  if (!row) return { row: null, mode: 'new', empNo: empNo, name: name, pw: pw };

  if (row.name !== name) {
    return err_('NAME_MISMATCH', '사번과 이름이 일치하지 않습니다. 다시 확인해주세요.');
  }

  var locked = checkLock_(row);
  if (locked) return locked;

  // 관리자가 대리 입력한 행은 비밀번호가 없다. 이 사람이 지금 이어받는다.
  if (!row.pwHash) {
    return { row: row, mode: 'claim', empNo: empNo, name: name, pw: pw };
  }

  if (hashPw_(row.salt, pw) !== row.pwHash) {
    return registerFailure_(row);
  }

  clearFailure_(row);
  return { row: row, mode: 'existing', empNo: empNo, name: name, pw: pw };
}

/**
 * auth 는 읽기처럼 보이지만 failCount 를 쓴다.
 * 락이 없으면 동시에 들어온 두 번의 오입력이 둘 다 3을 읽고 4를 써서
 * 5회 잠금이 영영 걸리지 않는다. 그래서 save 와 똑같이 감싼다.
 */
function handleAuth_(req) {
  return withLock_(function () {
    var v = verifyCredentials_(req);
    if (v.ok === false) return v;

    return ok_({
      mode: v.mode,
      empNo: v.empNo,
      name: v.name,
      picks: {
        A: v.row ? !!v.row.pickA : false,
        B: v.row ? !!v.row.pickB : false,
      },
      updatedAt: v.row ? v.row.updatedAt : '',
    });
  });
}

/** ===================== 저장 ===================== */

function handleSave_(req) {
  return withLock_(function () {
    var v = verifyCredentials_(req);
    if (v.ok === false) return v;

    var iso = now_().toISOString();
    var pickA = boolOf_(req.pickA);
    var pickB = boolOf_(req.pickB);
    var row = v.row;
    var action;

    if (!row) {
      // 삭제된 행이 있으면 되살린다. 같은 사번의 active 행이 둘이 되면 안 된다.
      var buried = findAnyByEmpNo_(readRows_(), v.empNo);
      if (buried.length > 0) {
        row = buried[0];
        row.status = 'active';
        row.name = v.name;
        row.pwHash = '';   // 되살리기는 곧 재가입이다 — 삭제 전 비밀번호는 살아남지 않는다
        row.salt = '';
        // createdAt 은 일부러 그대로 둔다: 삭제 전 이 사람이 처음 응답한 시점이라
        // 되살아났다고 바뀌면 안 된다.
        action = 'revive';
      } else {
        row = blankRow_(v.empNo, v.name);
        action = 'create';
      }
    } else {
      action = 'update';
    }

    if (!row.pwHash) {                 // 신규이거나 관리자 대리 입력 행, 또는 되살아난 행
      row.salt = newSalt_();
      row.pwHash = hashPw_(row.salt, v.pw);
      if (action !== 'create' && action !== 'revive') action = 'claim';
    }

    row.pickA = pickA;
    row.pickB = pickB;
    row.updatedAt = iso;
    row.updatedBy = 'self';
    row.failCount = 0;
    row.lockedUntil = '';
    if (!row.createdAt) row.createdAt = iso;

    if (row.rowIndex) writeRow_(row); else appendRow_(row);

    writeLog_(action, v.empNo, 'self', 'A=' + pickA + ' B=' + pickB);

    return ok_({ picks: { A: pickA, B: pickB }, updatedAt: iso });
  });
}

/** ===================== 관리자 ===================== */

var P_ADMIN_HASH = 'ADMIN_PW_HASH';
var P_ADMIN_SALT = 'ADMIN_SALT';
var P_ADMIN_FAIL = 'ADMIN_FAIL_COUNT';
var P_ADMIN_LOCK = 'ADMIN_LOCKED_UNTIL';

/**
 * ▶ 편집기에서 한 번만 실행하는 셋업 함수.
 *   아래 'CHANGE_ME' 를 실제 관리자 비밀번호로 바꾸고 실행한 뒤,
 *   다시 'CHANGE_ME' 로 되돌려 저장할 것. (4자리 제한 없음. 길수록 좋다.)
 */
function setupAdminPassword() {
  setAdminPassword_('CHANGE_ME');
}

function setAdminPassword_(pw) {
  var props = PropertiesService.getScriptProperties();
  var salt = newSalt_();
  props.setProperty(P_ADMIN_SALT, salt);
  props.setProperty(P_ADMIN_HASH, hashPw_(salt, String(pw)));
  props.setProperty(P_ADMIN_FAIL, '0');
  props.deleteProperty(P_ADMIN_LOCK);
}

function requireAdmin_(req) {
  var props = PropertiesService.getScriptProperties();
  var hash = props.getProperty(P_ADMIN_HASH);
  var salt = props.getProperty(P_ADMIN_SALT);
  if (!hash || !salt) {
    return err_('ADMIN_DENIED', '관리자 비밀번호가 설정되어 있지 않습니다.');
  }

  var lockedUntil = props.getProperty(P_ADMIN_LOCK);
  if (lockedUntil && now_().getTime() < new Date(lockedUntil).getTime()) {
    return err_('LOCKED', '관리자 로그인이 일시적으로 잠겼습니다.', { lockedUntil: lockedUntil });
  }
  if (lockedUntil) {
    props.setProperty(P_ADMIN_FAIL, '0');
    props.deleteProperty(P_ADMIN_LOCK);
  }

  if (hashPw_(salt, String(req.adminPw == null ? '' : req.adminPw)) !== hash) {
    var fail = Number(props.getProperty(P_ADMIN_FAIL) || 0) + 1;
    props.setProperty(P_ADMIN_FAIL, String(fail));
    if (fail >= MAX_FAIL) {
      props.setProperty(P_ADMIN_LOCK,
        new Date(now_().getTime() + LOCK_MINUTES * 60000).toISOString());
    }
    return err_('ADMIN_DENIED', '관리자 비밀번호가 일치하지 않습니다.');
  }

  props.setProperty(P_ADMIN_FAIL, '0');
  return null;
}

function activeRows_(rows) {
  var out = [];
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].status === 'active') out.push(rows[i]);
  }
  return out;
}

function computeStats_(rows) {
  var st = { total: 0, a: 0, b: 0, both: 0, onlyA: 0, onlyB: 0, none: 0 };
  var act = activeRows_(rows);
  for (var i = 0; i < act.length; i += 1) {
    var r = act[i];
    st.total += 1;
    if (r.pickA) st.a += 1;
    if (r.pickB) st.b += 1;
    if (r.pickA && r.pickB) st.both += 1;
    else if (r.pickA) st.onlyA += 1;
    else if (r.pickB) st.onlyB += 1;
    else st.none += 1;
  }
  return st;
}

/** 자유 입력 방식의 대가인 오타를 관리자 눈에 먼저 띄게 한다. */
function computeWarnings_(rows) {
  var warnings = [];

  var byName = {};
  var act = activeRows_(rows);
  for (var i = 0; i < act.length; i += 1) {
    var n = act[i].name;
    if (!byName[n]) byName[n] = [];
    if (byName[n].indexOf(act[i].empNo) < 0) byName[n].push(act[i].empNo);
  }
  for (var name in byName) {
    if (byName[name].length > 1) {
      warnings.push({ type: 'SAME_NAME_DIFF_EMPNO', name: name, empNos: byName[name] });
    }
  }

  // 같은 사번은 active 가 하나뿐이므로 삭제분까지 봐야 잡힌다.
  var byEmp = {};
  for (var j = 0; j < rows.length; j += 1) {
    var e = rows[j].empNo;
    if (!byEmp[e]) byEmp[e] = [];
    if (byEmp[e].indexOf(rows[j].name) < 0) byEmp[e].push(rows[j].name);
  }
  for (var emp in byEmp) {
    if (byEmp[emp].length > 1) {
      warnings.push({ type: 'SAME_EMPNO_DIFF_NAME', empNo: emp, names: byEmp[emp] });
    }
  }

  return warnings;
}

function publicRow_(r) {
  return {
    empNo: r.empNo, name: r.name,
    pickA: !!r.pickA, pickB: !!r.pickB,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
    updatedBy: r.updatedBy, status: r.status,
    hasPw: !!r.pwHash,          // 해시 자체는 절대 내보내지 않는다
    locked: !!(r.lockedUntil && now_().getTime() < new Date(r.lockedUntil).getTime()),
  };
}

function handleAdminData_(req) {
  var denied = requireAdmin_(req);
  if (denied) return denied;

  var rows = readRows_();
  var act = activeRows_(rows);
  var out = [];
  for (var i = 0; i < act.length; i += 1) out.push(publicRow_(act[i]));
  out.sort(function (x, y) { return x.empNo < y.empNo ? -1 : (x.empNo > y.empNo ? 1 : 0); });

  return ok_({
    stats: computeStats_(rows),
    rows: out,
    warnings: computeWarnings_(rows),
  });
}

function handleAdminResetPw_(req) {
  return withLock_(function () {
    var denied = requireAdmin_(req);
    if (denied) return denied;

    var empNo = normalizeEmpNo_(req.empNo);
    if (!empNo) return err_('BAD_EMPNO', '사번은 숫자 5자리입니다.');

    var row = findByEmpNo_(readRows_(), empNo);
    if (!row) return err_('NOT_FOUND', '해당 사번의 응답이 없습니다.');

    row.pwHash = '';
    row.salt = '';
    row.failCount = 0;
    row.lockedUntil = '';
    writeRow_(row);
    writeLog_('admin_reset_pw', empNo, 'admin', '');

    return ok_({ empNo: empNo });
  });
}

function handleAdminUpsert_(req) {
  return withLock_(function () {
    var denied = requireAdmin_(req);
    if (denied) return denied;

    var empNo = normalizeEmpNo_(req.empNo);
    if (!empNo) return err_('BAD_EMPNO', '사번은 숫자 5자리입니다.');
    var name = normalizeName_(req.name);
    if (!name) return err_('BAD_NAME', '이름을 입력해주세요.');

    var rows = readRows_();
    var row = findByEmpNo_(rows, empNo);
    var isNew = false;
    if (!row) {
      var buried = findAnyByEmpNo_(rows, empNo);
      if (buried.length > 0) { row = buried[0]; row.status = 'active'; }
      else { row = blankRow_(empNo, name); isNew = true; }
    }

    row.name = name;
    row.pickA = boolOf_(req.pickA);
    row.pickB = boolOf_(req.pickB);
    row.updatedAt = now_().toISOString();
    row.updatedBy = 'admin';
    // pwHash 는 건드리지 않는다. 신규면 빈 값이라 본인이 나중에 이어받는다.

    if (row.rowIndex) writeRow_(row); else appendRow_(row);
    writeLog_('admin_upsert', empNo, 'admin',
      (isNew ? 'new ' : 'edit ') + 'A=' + row.pickA + ' B=' + row.pickB);

    return ok_({ empNo: empNo, created: isNew });
  });
}

function handleAdminDelete_(req) {
  return withLock_(function () {
    var denied = requireAdmin_(req);
    if (denied) return denied;

    var empNo = normalizeEmpNo_(req.empNo);
    if (!empNo) return err_('BAD_EMPNO', '사번은 숫자 5자리입니다.');

    var row = findByEmpNo_(readRows_(), empNo);
    if (!row) return err_('NOT_FOUND', '해당 사번의 응답이 없습니다.');

    row.status = 'deleted';
    row.updatedAt = now_().toISOString();
    row.updatedBy = 'admin';
    writeRow_(row);
    writeLog_('admin_delete', empNo, 'admin', '');

    return ok_({ empNo: empNo });
  });
}

/** ===================== 진입점 ===================== */

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (parseErr) {
    req = null;
  }
  return ContentService
    .createTextOutput(JSON.stringify(handleRequest_(req)))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  // JSONP 경로. fetch 가 사내망에서 막혔을 때만 쓰인다.
  var req = null;
  try {
    req = JSON.parse(e.parameter.payload);
  } catch (parseErr) {
    req = null;
  }
  var body = JSON.stringify(handleRequest_(req));
  var cb = String(e.parameter.callback || '').replace(/[^A-Za-z0-9_$]/g, '');
  if (!cb) {
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(cb + '(' + body + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function handleRequest_(req) {
  try {
    if (!req || typeof req !== 'object') {
      return err_('SERVER_ERROR', '요청을 이해할 수 없습니다.');
    }
    switch (req.action) {
      case 'ping': return handlePing_();
      case 'auth': return handleAuth_(req);
      case 'save': return handleSave_(req);
      case 'adminData': return handleAdminData_(req);
      case 'adminResetPw': return handleAdminResetPw_(req);
      case 'adminUpsert': return handleAdminUpsert_(req);
      case 'adminDelete': return handleAdminDelete_(req);
      default: return err_('SERVER_ERROR', '알 수 없는 요청입니다.');
    }
  } catch (e) {
    return err_('SERVER_ERROR', '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
}

/** ===================== 진단 ===================== */

function handlePing_() {
  var sheetOk = false;
  try {
    sheetOk = !!sheet_(SHEET_RESPONSES);
  } catch (e) {
    sheetOk = false;
  }
  return ok_({ pong: true, sheetOk: sheetOk, at: now_().toISOString() });
}
