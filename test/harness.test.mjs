import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer, hostify } from './harness/load-code-gs.mjs';

// 이 파일은 하네스 자체(realm 정규화)를 검증한다. apps-script/Code.gs 의 동작이 아니라
// test/harness/load-code-gs.mjs 의 hostify() 가 하네스 경계(call()/rows()/logRows())에서
// 제대로 동작하는지가 관심사다.

test('중첩 구조(행-안-행)를 host 배열 리터럴과 deepEqual 로 바로 비교할 수 있다', () => {
  // 이게 핵심 케이스다: 예전의 얕은 [...x] 스프레드는 바깥 배열만 host realm 으로 바꾸고
  // 안쪽 행 배열은 sandbox realm 인 채로 남겨서, 이런 중첩 구조에서는 여전히 실패했다.
  const s = loadServer();
  s.fn.appendRow_(s.fn.blankRow_('00042', '이영희'));
  s.fn.appendRow_(s.fn.blankRow_('00099', '박민수'));

  assert.deepEqual(s.rows(), [
    ['00042', '이영희', false, false, '', '', '2026-08-12T09:00:00.000Z',
     '2026-08-12T09:00:00.000Z', 'self', 'active', 0, ''],
    ['00099', '박민수', false, false, '', '', '2026-08-12T09:00:00.000Z',
     '2026-08-12T09:00:00.000Z', 'self', 'active', 0, ''],
  ]);
});

test('call() 이 돌려주는 중첩 객체를 host 객체 리터럴과 deepEqual 로 바로 비교할 수 있다', () => {
  // handleRequest_/ok_ 가 sandbox 안에서 만드는 { ok, data: {...} } 는 바깥 객체와 data
  // 둘 다 sandbox realm 리터럴이다. hostify 가 재귀적으로 걷지 않으면 data 안쪽에서 깨진다.
  const s = loadServer();
  const res = s.call({ action: 'ping' });

  assert.deepEqual(res, {
    ok: true,
    data: { pong: true, sheetOk: true, at: '2026-08-12T09:00:00.000Z' },
  });
});

test('hostify 는 원시값·null·undefined·boolean 을 그대로 돌려준다', () => {
  // 현재 Code.gs 가 돌려주는 값 중에는 null/undefined/symbol/bigint 가 자연히 나오는
  // 경로가 없어서(추가되면 위 두 테스트처럼 loadServer() 경계로 검증한다), 이 원시값
  // 분기는 hostify 를 직접 불러 검증한다.
  assert.equal(hostify(null), null);
  assert.equal(hostify(undefined), undefined);
  assert.equal(hostify(true), true);
  assert.equal(hostify(false), false);
  assert.equal(hostify('문자열'), '문자열');
  assert.equal(hostify(42), 42);
  assert.equal(hostify(0), 0);
  assert.equal(hostify(10n), 10n);
  const sym = Symbol('x');
  assert.equal(hostify(sym), sym);
});

test('hostify 는 Date 를 host realm Date 로 복제한다', () => {
  // Code.gs 는 모든 시각을 now_().toISOString() 으로 문자열화해 내보내므로 이 분기는
  // 지금은 실제 경계에서 안 쓰인다. 그래도 Code.gs 가 Date 를 그대로 돌려주도록 바뀌는
  // 날 조용히 깨지지 않게 여기서 붙잡아둔다.
  const original = new Date('2026-08-12T09:00:00.000Z');
  const copy = hostify(original);
  assert.ok(copy instanceof Date, 'host realm 의 Date 여야 한다');
  assert.notEqual(copy, original, '원본을 그대로 돌려주면 안 된다');
  assert.equal(copy.getTime(), original.getTime());
  assert.deepEqual(hostify({ at: original }), { at: new Date('2026-08-12T09:00:00.000Z') });
});

test('hostify 는 순환 참조가 있어도 무한루프에 빠지지 않는다', () => {
  const cyclic = { name: 'a' };
  cyclic.self = cyclic;
  const out = hostify(cyclic);
  assert.equal(out.name, 'a');
  assert.equal(out.self, out, '순환은 이미 만든 사본을 다시 가리켜야 한다');
});

test('s.sheets 는 hostify 되지 않은, 살아있는 fake 그대로다', () => {
  const s = loadServer();
  // sheets 를 하네스 밖에서 직접 건드리고, 그 변화가 이후 s.rows()/s.call() 에 반영되는지
  // 확인한다. hostify 가 sheets 를 정적 사본으로 바꿔버리면 이 테스트가 깨진다 — 앞으로
  // 누군가 실수로 `sheets: hostify(sheets)` 로 바꾸는 걸 잡기 위한 회귀 가드다.
  s.sheets.responses.appendRow(['00042', '이영희', false, false, '', '',
    '2026-08-12T09:00:00.000Z', '2026-08-12T09:00:00.000Z', 'self', 'active', 0, '']);
  assert.equal(s.rows().length, 1, '시트 fake 를 직접 건드린 결과가 하네스에 그대로 보여야 한다');

  delete s.sheets.responses;
  const res = s.call({ action: 'ping' });
  assert.equal(res.data.sheetOk, false, 'responses 시트 삭제가 실제 동작에 영향을 줘야 한다');
});
