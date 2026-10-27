// Read-only presentation adapter for the existing RawStoryAnalysis JSON.
export const CARD_SIZE = [244, 112];
export const EDGE_LABEL_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
export const EDGE_LABEL_FONT_SIZE = 12;
export const EDGE_LABEL_MAX_WIDTH = 180;
const text = (value) => typeof value === 'string' ? value.trim() : '';
const validId = (value) => typeof value === 'string' && value.trim().length > 0;

export function adaptAnalysis(input) {
  if (!input || !Array.isArray(input.characters) || !Array.isArray(input.relations)) {
    throw new Error('JSON 需要包含 characters 和 relations 数组（现有 RawStoryAnalysis 格式）。');
  }
  const warnings = [];
  const nodes = [];
  const nodeById = new Map();
  for (const [index, raw] of input.characters.entries()) {
    if (!raw || !validId(raw.id) || nodeById.has(raw.id)) {
      warnings.push(`第 ${index + 1} 个人物缺少有效 ID 或 ID 重复，已跳过。`);
      continue;
    }
    const node = {
      id: `character:${raw.id}`, originalId: raw.id,
      name: text(raw.name) || raw.id,
      aliases: Array.isArray(raw.aliases) ? raw.aliases.filter((alias) => text(alias)) : [],
      description: text(raw.description),
      avatar: text(raw.avatar) || text(raw.avatar_url), raw,
    };
    nodes.push(node);
    nodeById.set(raw.id, node);
  }
  const relations = [];
  const groups = new Map();
  for (const [index, raw] of input.relations.entries()) {
    const source = nodeById.get(raw?.source_character_id);
    const target = nodeById.get(raw?.target_character_id);
    if (!source || !target) {
      warnings.push(`第 ${index + 1} 条关系的起点或终点不存在，已跳过。`);
      continue;
    }
    const pair = [source.id, target.id].sort();
    // JSON encoding is unambiguous even when user IDs contain separators.
    const groupId = JSON.stringify(pair);
    const relation = {
      // Index also preserves repeated/missing relation IDs without overwriting edges.
      id: `relation:${index}:${text(raw.id)}`, originalId: text(raw.id),
      source: source.id, target: target.id, groupId,
      label: text(raw.type) || text(raw.description) || '未命名关系',
      description: text(raw.description),
      // Existing schema expresses direction through source/target. Reciprocal
      // records remain independent; optional explicit two-way flags are display-only.
      bidirectional: raw.bidirectional === true || raw.direction === 'both', raw,
    };
    relations.push(relation);
    if (!groups.has(groupId)) groups.set(groupId, { id: groupId, pair, relations: [] });
    groups.get(groupId).relations.push(relation);
  }
  return { nodes, relations, groups, warnings };
}

export function relationColor(label) {
  if (/亲密|爱|恋/.test(label)) return '#a33d72';
  if (/夫妻|婚/.test(label)) return '#a34b3f';
  if (/行动|秘密|联络/.test(label)) return '#306e9e';
  return '#527452';
}

export function displayEdges(model, expanded = new Set()) {
  const edges = [];
  for (const group of model.groups.values()) {
    const { relations, pair, id: groupId } = group;
    if (relations.length > 1 && !expanded.has(groupId)) {
      const forward = relations.some((r) => r.source === pair[0] || r.bidirectional);
      const backward = relations.some((r) => r.source === pair[1] || r.bidirectional);
      edges.push({
        id: `aggregate:${groupId}`, source: pair[0], target: pair[1],
        data: { groupId, aggregate: true, count: relations.length },
        style: {
          labelText: `${relations.length} 条关系 · 点击展开`, curveOffset: 0,
          stroke: '#657583', startArrow: backward, endArrow: forward,
          lineDash: [5, 4], loopDist: 100,
        },
      });
      continue;
    }
    relations.forEach((relation, index) => {
      // Reverse edges need the opposite sign to occupy a distinct physical lane.
      // Adjacent labels are 40px apart at the quadratic midpoint, without a cap.
      const lane = (index - (relations.length - 1) / 2) * 80;
      edges.push({
        id: relation.id, source: relation.source, target: relation.target,
        data: { groupId, relationId: relation.id, aggregate: false },
        style: {
          labelText: relation.label,
          curveOffset: relation.source === pair[0] ? lane : -lane,
          stroke: relationColor(relation.label),
          startArrow: relation.bidirectional, endArrow: true,
          loopPlacement: 'top', loopDist: 90 + index * 64,
        },
      });
    });
  }
  return edges;
}

export function safeAvatarUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://local.invalid/');
    return ['https:', 'http:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}
