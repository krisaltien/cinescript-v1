import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptAnalysis, CARD_SIZE } from '../src/graph-data.js';
import { layoutRelationships, measureGroupLabels, springDistance } from '../src/graph-layout.js';
import { analysisFixture } from './fixtures.mjs';

const options = { width: 1136, height: 738, measureText: (text) => text.length * 12 };
const positions = (result) => result.nodes.map((node) => ({ id: node.id, ...node.style }));
function assertNoOverlap(result) {
  const nodes = positions(result);
  for (let i = 0; i < nodes.length; i++) {
    assert.ok(Number.isFinite(nodes[i].x) && Number.isFinite(nodes[i].y));
    for (let j = i + 1; j < nodes.length; j++) {
      assert.ok(Math.abs(nodes[i].x - nodes[j].x) >= CARD_SIZE[0] - 0.1 ||
        Math.abs(nodes[i].y - nodes[j].y) >= CARD_SIZE[1] - 0.1, `${nodes[i].id} overlaps ${nodes[j].id}`);
    }
  }
}
function modelWithIslands(count) {
  const raw = analysisFixture();
  raw.characters = raw.characters.filter((node) => node.id !== 'isolated');
  raw.characters.push(...Array.from({ length: count }, (_, index) => ({ id: `island-${index}`, name: `孤立人物 ${index}` })));
  return adaptAnalysis(raw);
}

test('spring distance adapts to measured label width and card direction', () => {
  const source = { x: 0, y: 0 };
  assert.equal(springDistance(source, { x: 100, y: 0 }, 30), CARD_SIZE[0] + 30 + 36);
  assert.equal(springDistance(source, { x: 0, y: 100 }, 30), CARD_SIZE[1] + 30 + 36);
  assert.ok(springDistance(source, { x: 100, y: 0 }, 150) > springDistance(source, { x: 100, y: 0 }, 30));
});

test('label measurement uses actual font metrics, max rendered width and every parallel label', () => {
  const model = adaptAnalysis(analysisFixture());
  const measured = [];
  const labels = measureGroupLabels(model, (text) => { measured.push(text); return text === '行动目标' ? 172 : 20; });
  const group = model.relations[0].groupId;
  assert.equal(labels.get(group).width, 184);
  assert.ok(measured.includes('3 条关系 · 点击展开'));
  assert.ok(measured.includes('掩护性交往'));
  assert.equal(measureGroupLabels(model, () => 2000).get(group).width, 192);
});

test('force snapshots are deterministic, finite and do not mutate the input', async () => {
  const raw = analysisFixture();
  const before = JSON.stringify(raw);
  const model = adaptAnalysis(raw);
  const first = await layoutRelationships(model, options);
  const second = await layoutRelationships(model, options);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(first.nodes.length, raw.characters.length);
  assertNoOverlap(first);
});

test('longer relationship labels produce a longer spring equilibrium, without huge fixed layer gaps', async () => {
  const raw = { characters: [{ id: 'a' }, { id: 'b' }], relations: [{ source_character_id: 'a', target_character_id: 'b', type: '短' }] };
  const short = positions(await layoutRelationships(adaptAnalysis(raw), options));
  raw.relations[0].type = '更长一些需要预留阅读空间的关系文字';
  const long = positions(await layoutRelationships(adaptAnalysis(raw), options));
  const distance = (nodes) => Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
  assert.ok(distance(long) > distance(short) + 40);
  assert.ok(distance(short) < 450);
});

test('20 isolated people form a compact multi-row, multi-column grid, outside the connected network', async () => {
  const model = modelWithIslands(20);
  const result = await layoutRelationships(model, options);
  assertNoOverlap(result);
  const islands = positions(result).filter((node) => node.id.startsWith('character:island-'));
  const columns = new Set(islands.map((node) => node.x));
  const rows = new Set(islands.map((node) => node.y));
  assert.ok(columns.size >= 2 && columns.size < islands.length);
  assert.ok(rows.size >= 2 && rows.size < islands.length);
  assert.equal(islands.length, 20);
  assert.ok(Math.max(...islands.map((node) => node.y)) - Math.min(...islands.map((node) => node.y)) < 1000);
});

test('adding islands does not distort the connected network geometry', async () => {
  const core = positions(await layoutRelationships(modelWithIslands(0), options));
  const full = positions(await layoutRelationships(modelWithIslands(20), options));
  for (const node of core) {
    const match = full.find((candidate) => candidate.id === node.id);
    assert.equal(match.x, node.x);
    assert.equal(match.y, node.y);
  }
});

test('all-island and empty JSON need no force simulation; grid adapts to viewport shape', async () => {
  const model = adaptAnalysis({ characters: Array.from({ length: 21 }, (_, index) => ({ id: `${index}` })), relations: [] });
  const desktop = await layoutRelationships(model, options);
  const narrow = await layoutRelationships(model, { ...options, width: 390, height: 640 });
  assertNoOverlap(desktop);
  assertNoOverlap(narrow);
  assert.equal(desktop.nodes.length, 21);
  const columns = (result) => new Set(positions(result).map((node) => node.x)).size;
  assert.ok(columns(narrow) < columns(desktop));
  assert.deepEqual(await layoutRelationships(adaptAnalysis({ characters: [], relations: [] }), options), { nodes: [] });
});

test('star networks and cycles keep rectangular cards separated, retaining all nodes', async () => {
  const characters = Array.from({ length: 18 }, (_, index) => ({ id: `n${index}` }));
  const relations = characters.slice(1).map((node, index) => ({ source_character_id: 'n0', target_character_id: node.id, type: `关系 ${index}` }));
  relations.push(...characters.map((node, index) => ({ source_character_id: node.id, target_character_id: characters[(index + 1) % characters.length].id, type: '环路' })));
  const result = await layoutRelationships(adaptAnalysis({ characters, relations }), options);
  assert.equal(result.nodes.length, 18);
  assertNoOverlap(result);
});
