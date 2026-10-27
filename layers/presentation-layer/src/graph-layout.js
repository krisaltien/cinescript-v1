import { BaseLayout, D3ForceLayout } from '@antv/g6';
import { CARD_SIZE, EDGE_LABEL_MAX_WIDTH } from './graph-data.js';

const CARD_GAP = 20;
const SECTION_GAP = 64;
const TICKS = 360;

export function measureGroupLabels(model, measureText) {
  const labels = new Map();
  for (const group of model.groups.values()) {
    const texts = group.relations.map((relation) => relation.label);
    if (texts.length > 1) texts.push(`${texts.length} 条关系 · 点击展开`);
    const widths = texts.map((label) => measureText(label));
    labels.set(group.id, {
      // Match the renderer's max width and horizontal padding, not an arbitrary
      // character count. Long labels already wrap/truncate in the graph.
      width: Math.min(EDGE_LABEL_MAX_WIDTH, Math.max(...widths)) + 12,
      height: widths.some((width) => width > EDGE_LABEL_MAX_WIDTH) ? 36 : 22,
    });
  }
  return labels;
}

/** Center-to-center length = two card-boundary radii + measured text + air. */
export function springDistance(source, target, labelWidth) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const boundary = Math.min(
    dx ? CARD_SIZE[0] / 2 * length / Math.abs(dx) : Infinity,
    dy ? CARD_SIZE[1] / 2 * length / Math.abs(dy) : Infinity,
  );
  return (Number.isFinite(boundary) ? boundary * 2 : CARD_SIZE[0]) + labelWidth + 36;
}

// Circular collision radii waste the space above/below wide HTML cards. Resolve
// the actual rectangles instead; this force exists only during the initial ticks.
function cardCollision() {
  let nodes = [];
  const force = () => {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x + b.vx - a.x - a.vx;
        const dy = b.y + b.vy - a.y - a.vy;
        const overlapX = CARD_SIZE[0] + CARD_GAP - Math.abs(dx);
        const overlapY = CARD_SIZE[1] + CARD_GAP - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (overlapX < overlapY) {
          const push = Math.sign(dx || 1) * overlapX / 2;
          a.vx -= push; b.vx += push;
        } else {
          const push = Math.sign(dy || 1) * overlapY / 2;
          a.vy -= push; b.vy += push;
        }
      }
    }
  };
  force.initialize = (value) => { nodes = value; };
  return force;
}

// Keep unrelated cards out of a link's corridor and its horizontal text box.
// This is a temporary layout force, not a permanent obstacle while dragging.
function linkClearance(edges, labels) {
  let nodes = [];
  const force = () => {
    for (const edge of edges) {
      const a = edge.source, b = edge.target;
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length, ny = dx / length;
      const radius = Math.abs(nx) * CARD_SIZE[0] / 2 + Math.abs(ny) * CARD_SIZE[1] / 2 + 12;
      const label = labels.get(edge.id);
      for (const node of nodes) {
        if (node === a || node === b) continue;
        const x = node.x + node.vx, y = node.y + node.vy;
        const t = ((x - a.x) * dx + (y - a.y) * dy) / (length * length);
        const normal = (x - a.x) * nx + (y - a.y) * ny;
        let pushX = 0, pushY = 0;
        if (t > 0 && t < 1 && Math.abs(normal) < radius) {
          const push = Math.sign(normal || 1) * (radius - Math.abs(normal)) * 0.5;
          pushX = nx * push; pushY = ny * push;
        } else {
          const lx = x - (a.x + b.x) / 2, ly = y - (a.y + b.y) / 2;
          const overlapX = (CARD_SIZE[0] + label.width) / 2 + 12 - Math.abs(lx);
          const overlapY = (CARD_SIZE[1] + label.height) / 2 + 12 - Math.abs(ly);
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) pushX = Math.sign(lx || 1) * overlapX * 0.5;
            else pushY = Math.sign(ly || 1) * overlapY * 0.5;
          }
        }
        node.vx += pushX; node.vy += pushY;
        a.vx -= pushX * 0.2; a.vy -= pushY * 0.2;
        b.vx -= pushX * 0.2; b.vy -= pushY * 0.2;
      }
    }
  };
  force.initialize = (value) => { nodes = value; };
  return force;
}

const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export function segmentsCross(a, b, c, d) {
  // Strict interior intersections only: common endpoints are legitimate joins.
  return cross(a, b, c) * cross(a, b, d) < -1e-6 &&
    cross(c, d, a) * cross(c, d, b) < -1e-6;
}

function sharesEndpoint(first, second) {
  return first.source.id === second.source.id || first.source.id === second.target.id ||
    first.target.id === second.source.id || first.target.id === second.target.id;
}

export function countEdgeCrossings(nodes, edges) {
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const resolved = edges.map((edge) => ({
    source: typeof edge.source === 'object' ? edge.source : positions.get(edge.source),
    target: typeof edge.target === 'object' ? edge.target : positions.get(edge.target),
  }));
  let count = 0;
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const first = resolved[i], second = resolved[j];
      if (!sharesEndpoint(first, second) && segmentsCross(first.source, first.target, second.source, second.target)) count++;
    }
  }
  return count;
}

// A crossing creates a temporary half-plane constraint: move the least costly
// endpoint across the other segment, towards its partner. Release the constraint
// immediately once resolved; persistent half-planes can overconstrain a graph.
export function crossingRepulsion(edges, degrees) {
  const plans = new Map();
  return () => {
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const first = edges[i], second = edges[j];
        if (sharesEndpoint(first, second)) continue;
        const crossing = segmentsCross(first.source, first.target, second.source, second.target);
        const key = `${i}:${j}`;
        if (!crossing) { plans.delete(key); continue; }
        let plan = plans.get(key);
        if (!plan) {
          const candidates = [
            [first.source, first.target, second.source, second.target],
            [first.target, first.source, second.source, second.target],
            [second.source, second.target, first.source, first.target],
            [second.target, second.source, first.source, first.target],
          ].map(([point, partner, a, b]) => {
            const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const distance = Math.abs(cross(a, b, point)) / length;
            return { point, partner, a, b, cost: (distance + 20) * (degrees.get(point.id) || 1) };
          });
          candidates.sort((a, b) => a.cost - b.cost);
          plan = candidates[0];
          plans.set(key, plan);
        }
        const { point, partner, a, b } = plan;
        const dx = b.x - a.x, dy = b.y - a.y;
        const length = Math.hypot(dx, dy) || 1;
        const nx = -dy / length, ny = dx / length;
        const side = Math.sign(cross(a, b, partner)) || 1;
        const signedDistance = ((point.x - a.x) * nx + (point.y - a.y) * ny) * side;
        const margin = Math.abs(nx) * CARD_SIZE[0] / 2 + Math.abs(ny) * CARD_SIZE[1] / 2 + CARD_GAP;
        const missing = margin - signedDistance;
        if (missing > 0) {
          const push = Math.min(36, missing * 0.3);
          point.vx += nx * side * push;
          point.vy += ny * side * push;
        }
      }
    }
  };
}

function segmentHitsCard(a, b, point) {
  let enter = 0, exit = 1;
  for (const [axis, size] of [['x', CARD_SIZE[0]], ['y', CARD_SIZE[1]]]) {
    const delta = b[axis] - a[axis];
    if (!delta) {
      if (Math.abs(a[axis] - point[axis]) > size / 2) return false;
    } else {
      const t1 = (point[axis] - size / 2 - a[axis]) / delta;
      const t2 = (point[axis] + size / 2 - a[axis]) / delta;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
    }
  }
  return enter <= exit;
}

// Crossing forces can settle in a local minimum. For small story graphs, finish
// with a bounded discrete penalty minimization over the generated card slots.
// Swaps never overlap cards and never add/remove/merge a relationship.
function uncrossLayout(nodes, edges, labels) {
  if (nodes.length > 32 || edges.length > 64) return;
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const score = () => {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (Math.abs(nodes[i].x - nodes[j].x) < CARD_SIZE[0] + CARD_GAP - 0.1 &&
          Math.abs(nodes[i].y - nodes[j].y) < CARD_SIZE[1] + CARD_GAP - 0.1) return null;
      }
    }
    let obstructions = 0, stress = 0;
    for (const edge of edges) {
      const a = positions.get(edge.source), b = positions.get(edge.target);
      const label = labels.get(edge.id);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      for (const node of nodes) {
        if (node !== a && node !== b && segmentHitsCard(a, b, node)) obstructions++;
        if (Math.abs(node.x - midX) < (CARD_SIZE[0] + label.width) / 2 &&
          Math.abs(node.y - midY) < (CARD_SIZE[1] + label.height) / 2) obstructions++;
      }
      const desired = springDistance(a, b, label.width);
      stress += ((Math.hypot(b.x - a.x, b.y - a.y) - desired) / desired) ** 2;
    }
    return [countEdgeCrossings(nodes, edges), obstructions, stress];
  };
  const better = (a, b) => a && (a[0] < b[0] || (a[0] === b[0] &&
    (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2] - 1e-6))));
  const swap = (a, b) => { [a.x, b.x] = [b.x, a.x]; [a.y, b.y] = [b.y, a.y]; };
  let current = score();
  for (let pass = 0; pass < 24 && (current[0] || current[1]); pass++) {
    let best = current, choice;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        swap(nodes[i], nodes[j]);
        const candidate = score();
        if (better(candidate, best)) { best = candidate; choice = { a: nodes[i], b: nodes[j] }; }
        swap(nodes[i], nodes[j]);
      }
    }
    // A slot swap can solve a crossing while placing text beside the wrong
    // card. Try exact clearance displacements too, never accepting overlap or
    // an increase in crossing count just to fix a label.
    const proposals = [];
    for (const edge of edges) {
      const a = positions.get(edge.source), b = positions.get(edge.target);
      const label = labels.get(edge.id);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length, ny = dx / length;
      for (const node of nodes) {
        if (Math.abs(node.x - mid.x) < (CARD_SIZE[0] + label.width) / 2 &&
          Math.abs(node.y - mid.y) < (CARD_SIZE[1] + label.height) / 2) {
          for (const [axis, halfSize] of [['x', (CARD_SIZE[0] + label.width) / 2 + 12], ['y', (CARD_SIZE[1] + label.height) / 2 + 12]]) {
            for (const side of [-1, 1]) {
              const move = (mid[axis] + side * halfSize - node[axis]) * (node === a || node === b ? 2 : 1);
              proposals.push({ node, x: node.x, y: node.y, [axis]: node[axis] + move });
            }
          }
        }
        if (node !== a && node !== b && segmentHitsCard(a, b, node)) {
          const signed = (node.x - a.x) * nx + (node.y - a.y) * ny;
          const radius = Math.abs(nx) * CARD_SIZE[0] / 2 + Math.abs(ny) * CARD_SIZE[1] / 2 + 12;
          for (const side of [-1, 1]) {
            const move = side * radius - signed;
            proposals.push({ node, x: node.x + nx * move, y: node.y + ny * move });
          }
        }
      }
    }
    for (const proposal of proposals) {
      const { node, x, y } = proposal;
      const original = { x: node.x, y: node.y };
      Object.assign(node, { x, y });
      const candidate = score();
      if (better(candidate, best)) { best = candidate; choice = proposal; }
      Object.assign(node, original);
    }
    if (!choice) break;
    if (choice.a) swap(choice.a, choice.b);
    else Object.assign(choice.node, { x: choice.x, y: choice.y });
    current = best;
  }
}

// Preserve the crossing-free geometry while opening only as much extra room
// as card/label bounds need. Uniform expansion cannot create a new crossing.
function reserveClearance(nodes, edges, labels) {
  const positions = new Map(nodes.map((node) => [node.id, node]));
  let scale = 1;
  for (const edge of edges) {
    const a = positions.get(edge.source), b = positions.get(edge.target);
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length, ny = dx / length;
    const label = labels.get(edge.id);
    for (const node of nodes) {
      if (node !== a && node !== b && segmentHitsCard(a, b, node)) {
        const distance = Math.abs((node.x - a.x) * nx + (node.y - a.y) * ny);
        const radius = Math.abs(nx) * CARD_SIZE[0] / 2 + Math.abs(ny) * CARD_SIZE[1] / 2 + 12;
        if (distance > 0.01) scale = Math.max(scale, radius / distance);
      }
      const lx = Math.abs(node.x - (a.x + b.x) / 2);
      const ly = Math.abs(node.y - (a.y + b.y) / 2);
      const needed = Math.min(
        lx ? ((CARD_SIZE[0] + label.width) / 2 + 12) / lx : Infinity,
        ly ? ((CARD_SIZE[1] + label.height) / 2 + 12) / ly : Infinity,
      );
      if (Number.isFinite(needed)) scale = Math.max(scale, needed);
    }
  }
  // Dense/non-planar data must not cause an unboundedly large canvas.
  scale = Math.min(scale, 2);
  if (scale > 1) nodes.forEach((node) => { node.x *= scale; node.y *= scale; });
}

// Finish tiny residual overlaps after the fixed tick budget, without leaving a
// running simulation or pushing nodes around while the user interacts.
function separateCards(nodes) {
  for (let pass = 0; pass < 100; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const overlapX = CARD_SIZE[0] + CARD_GAP - Math.abs(dx);
        const overlapY = CARD_SIZE[1] + CARD_GAP - Math.abs(dy);
        if (overlapX <= 0.01 || overlapY <= 0.01) continue;
        moved = true;
        if (overlapX < overlapY) {
          const push = Math.sign(dx || 1) * (overlapX / 2 + 0.01);
          a.x -= push; b.x += push;
        } else {
          const push = Math.sign(dy || 1) * (overlapY / 2 + 0.01);
          a.y -= push; b.y += push;
        }
      }
    }
    if (!moved) break;
  }
}

export function packIsolatedNodes(network, islands, { width, height }, hasLoops = false) {
  const halfWidth = CARD_SIZE[0] / 2, halfHeight = CARD_SIZE[1] / 2;
  let networkWidth = 0, networkHeight = 0;
  if (network.length) {
    const minX = Math.min(...network.map((node) => node.x)) - halfWidth;
    const minY = Math.min(...network.map((node) => node.y)) - halfHeight;
    networkWidth = Math.max(...network.map((node) => node.x)) + halfWidth - minX;
    networkHeight = Math.max(...network.map((node) => node.y)) + halfHeight - minY;
    // Self-loop curves/labels extend above the card bounds.
    const loopSpace = hasLoops ? 120 : 0;
    for (const node of network) { node.x -= minX; node.y += loopSpace - minY; }
    networkHeight += loopSpace;
  }
  if (!islands.length) return;
  const availableWidth = Math.max(1, width - 96);
  const availableHeight = Math.max(1, height - 96);
  let best;
  // Choose columns AND which side to use by the actual viewport aspect ratio.
  // This avoids turning 20 disconnected people into a very tall single column.
  const minColumns = islands.length > 1 && availableWidth >= CARD_SIZE[0] * 2 + CARD_GAP ? 2 : 1;
  for (let columns = minColumns; columns <= islands.length; columns++) {
    const rows = Math.ceil(islands.length / columns);
    const gridWidth = columns * CARD_SIZE[0] + (columns - 1) * CARD_GAP;
    const gridHeight = rows * CARD_SIZE[1] + (rows - 1) * CARD_GAP;
    for (const side of network.length ? ['below', 'right'] : ['alone']) {
      const x = side === 'right' ? networkWidth + SECTION_GAP : 0;
      const y = side === 'below' ? networkHeight + SECTION_GAP : 0;
      const totalWidth = Math.max(networkWidth, x + gridWidth);
      const totalHeight = Math.max(networkHeight, y + gridHeight);
      const score = Math.max(totalWidth / availableWidth, totalHeight / availableHeight);
      const area = totalWidth * totalHeight;
      if (!best || score < best.score - 1e-6 || (Math.abs(score - best.score) < 1e-6 && area < best.area)) {
        best = { columns, x, y, score, area };
      }
    }
  }
  islands.forEach((node, index) => {
    node.x = best.x + halfWidth + (index % best.columns) * (CARD_SIZE[0] + CARD_GAP);
    node.y = best.y + halfHeight + Math.floor(index / best.columns) * (CARD_SIZE[1] + CARD_GAP);
  });
}

export async function layoutRelationships(model, { width = 1000, height = 700, measureText } = {}) {
  const connected = new Set(model.relations.flatMap((relation) => [relation.source, relation.target]));
  const network = model.nodes.filter((node) => connected.has(node.id)).map((node) => ({ id: node.id }));
  const islands = model.nodes.filter((node) => !connected.has(node.id)).map((node) => ({ id: node.id }));
  if (network.length) {
    const labels = measureGroupLabels(model, measureText);
    const degree = new Map(network.map((node) => [node.id, 0]));
    const labelWidths = new Map(network.map((node) => [node.id, 0]));
    const edges = [];
    for (const group of model.groups.values()) {
      const [source, target] = group.pair;
      for (const id of group.pair) {
        degree.set(id, degree.get(id) + 1);
        labelWidths.set(id, Math.max(labelWidths.get(id), labels.get(group.id).width));
      }
      if (source !== target) edges.push({ id: group.id, source, target });
    }
    // Deterministic phyllotaxis seed: the most connected person starts near the
    // center, without any story-specific/manual coordinates or random drift.
    network.sort((a, b) => degree.get(b.id) - degree.get(a.id));
    network.forEach((node, index) => {
      const radius = 140 * Math.sqrt(index);
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius * 0.8;
    });
    const distance = (edge) => springDistance(edge.source, edge.target, labels.get(edge.id).width);
    const force = new D3ForceLayout({
      center: false, x: { x: 0, strength: 0.012 }, y: { y: 0, strength: 0.012 },
      manyBody: { strength: (node) => -(250 + labelWidths.get(node.id) * 4), distanceMax: 1400 },
      link: { id: (node) => node.id, distance, strength: 0.45, iterations: 2 },
      // Override the library's legacy edgeId default: d3 link IDs refer to nodes.
      edgeId: undefined,
      alphaDecay: 0.025, velocityDecay: 0.45,
    });
    let running;
    try {
      running = force.execute({ nodes: network, edges });
      force.stop(); // Never let d3's timer move rendered nodes in the background.
      force.force('card-collision', cardCollision());
      const links = force.getForce('link')?.links() || [];
      force.force('link-clearance', linkClearance(links, labels));
      force.force('crossing-repulsion', crossingRepulsion(links, degree));
      for (let tick = 0; tick < TICKS; tick += 30) {
        // Recompute card-boundary distances as the direction of a link changes.
        force.getForce('link')?.distance(distance);
        force.tick(30);
      }
      const positions = new Map(force.nodes().map((node) => [node.id, node]));
      network.forEach((node) => { node.x = positions.get(node.id).x; node.y = positions.get(node.id).y; });
      // Complete @antv/layout's pending execute Promise after our manual ticks,
      // exactly as an automatic d3 end event would, then dispose its resources.
      force.simulation.on('end')?.();
      await running;
    } finally {
      force.stop();
      force.destroy();
    }
    separateCards(network);
    uncrossLayout(network, edges, labels);
    reserveClearance(network, edges, labels);
  }
  packIsolatedNodes(network, islands, { width, height }, model.relations.some((relation) => relation.source === relation.target));
  const positions = new Map([...network, ...islands].map((node) => [node.id, node]));
  return {
    nodes: model.nodes.map((node) => {
      const position = positions.get(node.id);
      return { id: node.id, style: { x: position.x, y: position.y } };
    }),
  };
}

/** G6 layout extension; called on data import and explicit relayout, never drag. */
export class RelationshipLayout extends BaseLayout {
  id = 'relationship-layout';

  execute() {
    return layoutRelationships(this.options.getModel(), this.options);
  }
}
