import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptAnalysis, displayEdges, safeAvatarUrl } from '../src/graph-data.js';
import { analysisFixture } from './fixtures.mjs';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

test('all valid characters including disconnected ones are preserved; original input is never mutated', () => {
  const raw = freeze(analysisFixture());
  const before = JSON.stringify(raw);
  const model = adaptAnalysis(raw);
  assert.equal(model.nodes.length, raw.characters.length);
  assert.equal(model.relations.length, raw.relations.length);
  const expanded = new Set(model.groups.keys());
  displayEdges(model);
  displayEdges(model, expanded);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(model.nodes[0].raw, raw.characters[0]);
  assert.equal(model.relations[0].raw, raw.relations[0]);
});

test('aggregation is unordered by pair but does not discard relation identity/direction', () => {
  const model = adaptAnalysis(analysisFixture());
  const collapsed = displayEdges(model);
  assert.equal(collapsed.length, 3);
  const edge = collapsed.find((edge) => edge.data.count === 3);
  assert.equal(edge.style.startArrow, true);
  assert.equal(edge.style.endArrow, true);
  const expanded = displayEdges(model, new Set([edge.data.groupId]));
  assert.equal(expanded.length, 5);
  const groupEdges = expanded.filter((item) => item.data.groupId === edge.data.groupId);
  assert.equal(new Set(groupEdges.map((item) => item.id)).size, 3);
  assert.deepEqual(groupEdges.map((item) => [item.source, item.target]), [
    ['character:a', 'character:b'], ['character:b', 'character:a'], ['character:a', 'character:b'],
  ]);
  const physicalOffsets = groupEdges.map((item) => item.style.curveOffset * (item.source === edge.source ? 1 : -1));
  assert.equal(new Set(physicalOffsets).size, 3);
  assert.deepEqual(displayEdges(model), collapsed);
});

test('arbitrarily many parallel and reverse relations retain unique lanes and IDs, even with duplicate domain IDs', () => {
  const raw = analysisFixture();
  raw.relations = Array.from({ length: 51 }, (_, index) => ({
    id: 'repeated-id', type: `关系 ${index}`,
    source_character_id: index % 2 ? 'b' : 'a', target_character_id: index % 2 ? 'a' : 'b',
  }));
  const model = adaptAnalysis(raw);
  const edges = displayEdges(model, new Set(model.groups.keys()));
  assert.equal(edges.length, 51);
  assert.equal(new Set(edges.map((edge) => edge.id)).size, 51);
  const offsets = edges.map((edge) => edge.style.curveOffset * (edge.source === 'character:a' ? 1 : -1));
  assert.equal(new Set(offsets).size, 51);
  assert.equal(edges.every((edge) => edge.style.endArrow), true);
});

test('one-way aggregates do not introduce a reverse arrow; explicit two-way records get both arrows', () => {
  const raw = analysisFixture();
  raw.relations = [0, 1].map((i) => ({ id: `r${i}`, source_character_id: 'b', target_character_id: 'a', type: '同向' }));
  let model = adaptAnalysis(raw);
  let [edge] = displayEdges(model);
  assert.equal(edge.style.startArrow, true);
  assert.equal(edge.style.endArrow, false);
  raw.relations[0].bidirectional = true;
  model = adaptAnalysis(raw);
  [edge] = displayEdges(model, new Set(model.groups.keys()));
  assert.equal(edge.style.startArrow, true);
  assert.equal(edge.style.endArrow, true);
});

test('self relations receive separate loop sizes', () => {
  const model = adaptAnalysis(analysisFixture());
  const loops = displayEdges(model, new Set(model.groups.keys())).filter((edge) => edge.source === edge.target);
  assert.equal(loops.length, 2);
  assert.notEqual(loops[0].style.loopDist, loops[1].style.loopDist);
});

test('missing optional information degrades safely; invalid references are reported', () => {
  const model = adaptAnalysis({
    characters: [{ id: 'a' }, { id: 'b', name: '', aliases: null }, { id: 'a' }, null],
    relations: [{ source_character_id: 'a', target_character_id: 'b' }, { source_character_id: 'missing', target_character_id: 'a' }, null],
  });
  assert.equal(model.nodes.length, 2);
  assert.equal(model.nodes[0].name, 'a');
  assert.deepEqual(model.nodes[0].aliases, []);
  assert.equal(model.relations[0].label, '未命名关系');
  assert.equal(model.warnings.length, 4);
  assert.throws(() => adaptAnalysis({ nodes: [] }), /characters/);
  assert.deepEqual(adaptAnalysis({ characters: [], relations: [] }).nodes, []);
});

test('pair keys cannot collide when IDs contain delimiters, quotes or Unicode', () => {
  const raw = {
    characters: ['a|b', 'c', 'a', 'b|c', '__proto__', '人物"'].map((id) => ({ id })),
    relations: [
      { source_character_id: 'a|b', target_character_id: 'c' },
      { source_character_id: 'a', target_character_id: 'b|c' },
      { source_character_id: '__proto__', target_character_id: '人物"' },
    ],
  };
  assert.equal(adaptAnalysis(raw).groups.size, 3);
});

test('avatar URLs refuse executable schemes and gracefully allow existing web image fields', () => {
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'file:///tmp/a', 'blob:any']) {
    assert.equal(safeAvatarUrl(value), null);
  }
  assert.equal(safeAvatarUrl('https://example.org/avatar.png'), 'https://example.org/avatar.png');
  assert.equal(safeAvatarUrl('/avatars/a.png'), '/avatars/a.png');
});
