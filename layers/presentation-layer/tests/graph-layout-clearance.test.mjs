import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptAnalysis, CARD_SIZE } from '../src/graph-data.js';
import { layoutRelationships, measureGroupLabels, countEdgeCrossings } from '../src/graph-layout.js';

// Synthetic hub + triangle + branch topology, exercising a leaf that can
// otherwise sit across an unrelated relationship line and its text.
test('initial layout keeps unrelated cards clear of relationship segments and labels', async () => {
  const characters = Array.from({ length: 9 }, (_, index) => ({ id: `n${index}` }));
  const pairs = [[0, 2], [0, 6], [0, 1], [0, 5], [0, 4], [0, 3], [1, 2], [4, 7], [4, 8]];
  const types = ['掩护交往', '假扮夫妻', '需要保留较长文字的亲密关系', '亲密后疏远', '行动同伴', '猜测的嫉妒', '夫妻', '秘密联络', '同乡与消息渠道'];
  const model = adaptAnalysis({ characters, relations: pairs.map(([a, b], index) => ({ source_character_id: `n${a}`, target_character_id: `n${b}`, type: types[index] })) });
  const measureText = (text) => text.length * 12;
  const labels = measureGroupLabels(model, measureText);
  const result = await layoutRelationships(model, { width: 1136, height: 738, measureText });
  const positions = new Map(result.nodes.map((node) => [node.id, node.style]));
  const points = result.nodes.map((node) => ({ id: node.id, ...node.style }));
  assert.equal(countEdgeCrossings(points, model.relations), 0, 'this planar story topology must have no crossed links');
  for (const relation of model.relations) {
    const a = positions.get(relation.source), b = positions.get(relation.target);
    const label = labels.get(relation.groupId);
    for (const node of result.nodes) {
      if (node.id === relation.source || node.id === relation.target) continue;
      const p = node.style;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      assert.ok(Math.abs(p.x - midpoint.x) >= (CARD_SIZE[0] + label.width) / 2 ||
        Math.abs(p.y - midpoint.y) >= (CARD_SIZE[1] + label.height) / 2,
      `${node.id} covers the label of ${relation.id}`);
      // Segment/axis-aligned-card intersection using the slab method.
      let enter = 0, exit = 1;
      for (const [axis, size] of [['x', CARD_SIZE[0]], ['y', CARD_SIZE[1]]]) {
        const delta = b[axis] - a[axis];
        if (!delta) {
          if (Math.abs(a[axis] - p[axis]) > size / 2) exit = -1;
        } else {
          const hits = [(p[axis] - size / 2 - a[axis]) / delta, (p[axis] + size / 2 - a[axis]) / delta].sort((x, y) => x - y);
          enter = Math.max(enter, hits[0]);
          exit = Math.min(exit, hits[1]);
        }
      }
      assert.ok(enter > exit, `${node.id} blocks the segment of ${relation.id}`);
    }
  }
});
