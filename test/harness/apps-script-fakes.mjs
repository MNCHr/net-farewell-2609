import crypto from 'node:crypto';

// Apps Script 의 computeDigest 는 "부호 있는" 바이트(-128..127)를 돌려준다.
// 이 부호 처리를 흉내내지 않으면 해시값이 실제 배포본과 달라진다.
export function makeUtilities() {
  let uuidSeq = 0;
  return {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(_alg, str) {
      const buf = crypto.createHash('sha256').update(String(str), 'utf8').digest();
      return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
    },
    base64Encode(input) {
      if (typeof input === 'string') return Buffer.from(input, 'utf8').toString('base64');
      return Buffer.from(input.map((b) => (b < 0 ? b + 256 : b))).toString('base64');
    },
    getUuid() {
      uuidSeq += 1;
      return `00000000-0000-4000-8000-${String(uuidSeq).padStart(12, '0')}`;
    },
  };
}

export function makeSheet(name, rows) {
  const data = rows.map((r) => r.slice());
  const sheet = {
    getName: () => name,
    getLastRow: () => data.length,
    getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) }),
    appendRow(row) { data.push(row.slice()); },
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValues: () =>
          Array.from({ length: numRows }, (_, i) =>
            Array.from({ length: numCols }, (_, j) => data[row - 1 + i][col - 1 + j])),
        setValues(values) {
          for (let i = 0; i < numRows; i += 1) {
            for (let j = 0; j < numCols; j += 1) data[row - 1 + i][col - 1 + j] = values[i][j];
          }
        },
      };
    },
    __rows: () => data,
  };
  return sheet;
}

export function makeSpreadsheetApp(sheets) {
  return {
    getActive: () => ({ getSheetByName: (n) => sheets[n] || null }),
    getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null }),
  };
}

export function makePropertiesService(initial) {
  const store = { ...initial };
  const props = {
    getProperty: (k) => (k in store ? String(store[k]) : null),
    setProperty(k, v) { store[k] = String(v); return props; },
    deleteProperty(k) { delete store[k]; return props; },
    getProperties: () => ({ ...store }),
  };
  return { getScriptProperties: () => props, __store: store };
}

export function makeLockService({ fail = false } = {}) {
  return {
    getScriptLock: () => ({
      tryLock: () => !fail,
      releaseLock: () => {},
    }),
  };
}
