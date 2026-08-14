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

test('알 수 없는 퇴직자 키는 던진다', () => {
  // filterRows() 의 명시적 검사를 못 박아둔다 — else 로 뭉뚱그리면 퇴직자가 셋이 되는 날
  // C 필터가 조용히 B 명단을 내놓는다.
  assert.throws(() => buildTable(ROWS, RETIREES, 'C'));
});

/* ---------- 정산용 배타 필터 (BOTH / ONLY_A / ONLY_B) ---------- */

// 셋 다 서로 구분되는, 각기 비어있지 않은 행을 갖춘 픽스처.
const SETTLE_ROWS = [
  { email: 'both1@etri.re.kr', name: '둘다1', pickA: true,  pickB: true,  updatedAt: '2026-08-14T01:00:00.000Z' },
  { email: 'both2@etri.re.kr', name: '둘다2', pickA: true,  pickB: true,  updatedAt: '2026-08-14T02:00:00.000Z' },
  { email: 'onlyA1@etri.re.kr', name: 'A만1', pickA: true,  pickB: false, updatedAt: '2026-08-14T03:00:00.000Z' },
  { email: 'onlyB1@etri.re.kr', name: 'B만1', pickA: false, pickB: true,  updatedAt: '2026-08-14T04:00:00.000Z' },
  { email: 'onlyB2@etri.re.kr', name: 'B만2', pickA: false, pickB: true,  updatedAt: '2026-08-14T05:00:00.000Z' },
  { email: 'none1@etri.re.kr', name: '없음1', pickA: false, pickB: false, updatedAt: '2026-08-14T06:00:00.000Z' },
];

test('BOTH 필터는 두 분 다 고른 행만 남긴다', () => {
  const lines = buildTable(SETTLE_ROWS, RETIREES, 'BOTH').split('\n');
  assert.deepEqual(lines.slice(1).map((l) => l.split('\t')[0]), ['both1@etri.re.kr', 'both2@etri.re.kr']);
});

test('ONLY_A 필터는 A만 고른 행만 남긴다 (both, onlyB 는 빠진다)', () => {
  const lines = buildTable(SETTLE_ROWS, RETIREES, 'ONLY_A').split('\n');
  assert.deepEqual(lines.slice(1).map((l) => l.split('\t')[0]), ['onlyA1@etri.re.kr']);
});

test('ONLY_B 필터는 B만 고른 행만 남긴다 (both, onlyA 는 빠진다)', () => {
  const lines = buildTable(SETTLE_ROWS, RETIREES, 'ONLY_B').split('\n');
  assert.deepEqual(lines.slice(1).map((l) => l.split('\t')[0]), ['onlyB1@etri.re.kr', 'onlyB2@etri.re.kr']);
});

test('countFor 가 BOTH/ONLY_A/ONLY_B 인원도 센다', () => {
  assert.equal(countFor(SETTLE_ROWS, 'BOTH'), 2);
  assert.equal(countFor(SETTLE_ROWS, 'ONLY_A'), 1);
  assert.equal(countFor(SETTLE_ROWS, 'ONLY_B'), 2);
});

test('BOTH/ONLY_A/ONLY_B 는 서로 겹치지 않고, 합치면 최소 하나를 고른 행 전체가 된다', () => {
  const byKey = (key) => new Set(
    buildTable(SETTLE_ROWS, RETIREES, key).split('\n').slice(1).map((l) => l.split('\t')[0])
  );
  const both = byKey('BOTH');
  const onlyA = byKey('ONLY_A');
  const onlyB = byKey('ONLY_B');

  // 겹치지 않는다: 어떤 이메일도 두 무리에 동시에 속하지 않는다.
  for (const email of both) {
    assert.ok(!onlyA.has(email), `${email} 이 BOTH 와 ONLY_A 에 동시에 있음`);
    assert.ok(!onlyB.has(email), `${email} 이 BOTH 와 ONLY_B 에 동시에 있음`);
  }
  for (const email of onlyA) {
    assert.ok(!onlyB.has(email), `${email} 이 ONLY_A 와 ONLY_B 에 동시에 있음`);
  }

  // 합치면 최소 하나를 고른 행 전체(= A 또는 B, 즉 전체에서 아무것도 안 고른 행 제외)와 같다.
  const union = new Set([...both, ...onlyA, ...onlyB]);
  const atLeastOne = new Set(
    SETTLE_ROWS.filter((r) => r.pickA || r.pickB).map((r) => r.email)
  );
  assert.deepEqual(union, atLeastOne);
  assert.equal(union.size, atLeastOne.size);
});
