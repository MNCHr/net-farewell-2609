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
