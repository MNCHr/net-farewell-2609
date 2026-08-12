import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  makeUtilities, makeSheet, makeSpreadsheetApp, makePropertiesService, makeLockService,
  makeContentService,
} from './apps-script-fakes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CODE_PATH = path.join(ROOT, 'apps-script', 'Code.gs');

export const HEADER_RESPONSES = [
  'empNo', 'name', 'pickA', 'pickB', 'pwHash', 'salt',
  'createdAt', 'updatedAt', 'updatedBy', 'status', 'failCount', 'lockedUntil',
];
export const HEADER_LOG = ['at', 'action', 'empNo', 'actor', 'detail'];

export function loadServer({
  responses = [],
  properties = {},
  now = '2026-08-12T09:00:00.000Z',
  lockFails = false,
} = {}) {
  const sheets = {
    responses: makeSheet('responses', [HEADER_RESPONSES, ...responses]),
    log: makeSheet('log', [HEADER_LOG]),
  };
  const sandbox = {
    Utilities: makeUtilities(),
    SpreadsheetApp: makeSpreadsheetApp(sheets),
    PropertiesService: makePropertiesService(properties),
    LockService: makeLockService({ fail: lockFails }),
    ContentService: makeContentService(),
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CODE_PATH, 'utf8'), sandbox, { filename: 'Code.gs' });

  let current = new Date(now);
  sandbox.now_ = () => new Date(current.getTime());   // 시간 고정

  return {
    call: (req) => sandbox.handleRequest_(req),
    fn: sandbox,
    sheets,
    setNow: (iso) => { current = new Date(iso); },
    rows: () => sheets.responses.__rows().slice(1),
    logRows: () => sheets.log.__rows().slice(1),
  };
}
