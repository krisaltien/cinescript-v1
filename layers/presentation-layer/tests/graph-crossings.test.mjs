import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentsCross, countEdgeCrossings, crossingRepulsion, layoutRelationships, packIsolatedNodes } from '../src/graph-layout.js';
import { adaptAnalysis } from '../src/graph-data.js';

const point = (id, x, y) => ({ id, x, y, vx: 0, vy: 0 });

test('proper crossings are detected, but a common endpoint is a legitimate junction', () => {
  const a = point('a', 0, 0), b = point('b', 400, 400);
  const c = point('c', 0, 400), d = point('d', 400, 0);
  assert.equal(segmentsCross(a, b, c, d), true);
  assert.equal(countEdgeCrossings([a, b, c, d], [
    { source: 'a', target: 'b' }, { source: 'c', target: 'd' },
  ]), 1);
  assert.equal(countEdgeCrossings([a, b, c], [
    { source: 'a', target: 'b' }, { source: 'a', target: 'c' },
  ]), 0);
});

test('the crossing penalty really pushes an X apart rather than hiding either edge', () => {
  const nodes = [point('a', 0, 0), point('b', 400, 400), point('c', 0, 400), point('d', 400, 0)];
  const edges = [{ id: 'ab', source: nodes[0], target: nodes[1] }, { id: 'cd', source: nodes[2], target: nodes[3] }];
  const force = crossingRepulsion(edges, new Map(nodes.map((node) => [node.id, 1])));
  assert.equal(countEdgeCrossings(nodes, edges), 1);
  force();
  assert.ok(nodes.some((node) => Math.hypot(node.vx, node.vy) > 0));
  for (let tick = 0; tick < 40; tick++) {
    force();
    nodes.forEach((node) => { node.x += node.vx; node.y += node.vy; node.vx *= 0.5; node.vy *= 0.5; });
  }
  assert.equal(countEdgeCrossings(nodes, edges), 0);
  assert.equal(edges.length, 2);
});

test('non-planar inputs terminate within the fixed layout budget and retain all relationships', async () => {
  const characters = Array.from({ length: 5 }, (_, index) => ({ id: `${index}` }));
  const relations = [];
  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      relations.push({ id: `${i}-${j}`, source_character_id: `${i}`, target_character_id: `${j}`, type: '连接' });
    }
  }
  const raw = { characters, relations };
  const before = JSON.stringify(raw);
  const result = await layoutRelationships(adaptAnalysis(raw), { width: 1100, height: 700, measureText: (text) => text.length * 12 });
  assert.equal(result.nodes.length, 5);
  assert.equal(relations.length, 10);
  assert.equal(JSON.stringify(raw), before);
  assert.ok(result.nodes.every((node) => Number.isFinite(node.style.x) && Number.isFinite(node.style.y)));
});

test('resolved crossing constraints do not stretch a small planar story into a long column', async () => {
  const ids = ['1', '2', '3', '4', '10', '11', '13', '15', '16'].map((id) => `sejie-${id}`);
  const pairs = [[0, 2], [0, 6], [0, 1], [0, 5], [0, 4], [0, 3], [1, 2], [4, 7], [4, 8]];
  const labels = ['掩护性交往', '假扮夫妻', '秘密亲密关系与行动目标', '亲密后疏远', '行动同伴', '猜测的嫉妒', '夫妻', '秘密联络', '同乡与消息渠道'];
  const model = adaptAnalysis({ characters: ids.map((id) => ({ id })), relations: pairs.map(([a, b], i) => ({ source_character_id: ids[a], target_character_id: ids[b], type: labels[i] })) });
  const result = await layoutRelationships(model, { width: 1136, height: 738, measureText: (text) => text.length * 12 });
  const nodes = result.nodes.map((node) => ({ id: node.id, ...node.style }));
  assert.equal(countEdgeCrossings(nodes, model.relations), 0);
  assert.ok(Math.max(...nodes.map((node) => node.x)) - Math.min(...nodes.map((node) => node.x)) + 244 < 1600);
  assert.ok(Math.max(...nodes.map((node) => node.y)) - Math.min(...nodes.map((node) => node.y)) + 112 < 1200);
});

test('desktop island grids never degenerate into one long column beside a tall network', () => {
  const network = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 5000 }];
  const islands = Array.from({ length: 20 }, (_, index) => ({ id: `island-${index}` }));
  packIsolatedNodes(network, islands, { width: 1136, height: 738 });
  assert.ok(new Set(islands.map((node) => node.x)).size >= 2);
});
