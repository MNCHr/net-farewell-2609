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
