import { Graph, HTML, Quadratic, ExtensionCategory, register } from '@antv/g6';
import {
  adaptAnalysis, CARD_SIZE, displayEdges, safeAvatarUrl,
  EDGE_LABEL_FONT_FAMILY, EDGE_LABEL_FONT_SIZE, EDGE_LABEL_MAX_WIDTH,
} from './graph-data.js';
import { RelationshipLayout } from './graph-layout.js';

// HTML children report their own offsetX/Y. Use viewport coordinates so dragging
// a name, avatar or description behaves exactly like dragging the card itself.
class CharacterHTML extends HTML {
  getViewportXY(event) {
    return this.eventService.client2Viewport({ x: event.clientX, y: event.clientY });
  }
}

class RelationshipCurve extends Quadratic {
  getKeyPath(attributes) {
    const [a, b] = this.getEndpoints(attributes, false);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    const offset = attributes.curveOffset || 0;
    const control = [(a[0] + b[0]) / 2 - dy / length * offset,
      (a[1] + b[1]) / 2 + dx / length * offset];
    const [start, end] = this.getEndpoints(attributes, true, [control]);
    return [['M', ...start], ['Q', ...control, ...end]];
  }
}
register(ExtensionCategory.NODE, 'character-html', CharacterHTML);
register(ExtensionCategory.EDGE, 'relationship-curve', RelationshipCurve);
register(ExtensionCategory.LAYOUT, 'relationship-layout', RelationshipLayout);

/** Reusable, framework-independent G6 component. Never writes to the input JSON. */
export class RelationshipGraph {
  constructor(container, { onSelect = () => {}, onChange = () => {}, onError = () => {} } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.onError = onError;
    this.expanded = new Set();
    this.cards = new Map();
    this.queue = Promise.resolve();
    this.disposed = false;
    const textContext = document.createElement('canvas').getContext('2d');
    textContext.font = `${EDGE_LABEL_FONT_SIZE}px ${EDGE_LABEL_FONT_FAMILY}`;
    this.graph = new Graph({
      container, animation: false, autoResize: false, padding: 48,
      zoomRange: [0.08, 3],
      layout: {
        type: 'relationship-layout',
        getModel: () => this.model,
        measureText: (label) => textContext.measureText(label).width,
      },
      node: {
        type: 'character-html',
        style: {
          size: CARD_SIZE, dx: -CARD_SIZE[0] / 2, dy: -CARD_SIZE[1] / 2,
          innerHTML: (datum) => this.createCard(datum.id),
        },
      },
      edge: {
        type: 'relationship-curve',
        style: {
          lineWidth: 1.6, endArrow: true, endArrowSize: 8, startArrowSize: 8,
          cursor: 'pointer', increasedLineWidthForHitTesting: 10,
          labelFontFamily: EDGE_LABEL_FONT_FAMILY,
          labelFontSize: EDGE_LABEL_FONT_SIZE, labelFill: '#33444e', labelAutoRotate: false,
          labelBackground: true, labelBackgroundFill: '#f7f7f5',
          labelBackgroundRadius: 4, labelPadding: [4, 6],
          labelWordWrap: true, labelMaxWidth: EDGE_LABEL_MAX_WIDTH, labelMaxLines: 2,
          labelTextOverflow: 'ellipsis',
        },
        state: {
          active: { lineWidth: 3, labelFill: '#142f41', labelFontWeight: 700 },
          selected: { lineWidth: 3, labelFill: '#142f41', labelFontWeight: 700 },
        },
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
    });
    this.graph.on('node:click', (event) => this.selectNode(event.target.id));
    this.graph.on('edge:click', (event) => this.selectEdge(event.target.id));
    this.graph.on('edge:pointerover', (event) => this.hoverEdge(event.target.id, true));
    this.graph.on('edge:pointerout', (event) => this.hoverEdge(event.target.id, false));
    this.graph.on('canvas:click', () => this.clearSelection());
    this.resizeObserver = new ResizeObserver(() => {
      this.run(async () => {
        const { width, height } = this.container.getBoundingClientRect();
        if (width > 0 && height > 0) this.graph.setSize(width, height);
      });
    });
    this.resizeObserver.observe(container);
  }

  run(operation) {
    const result = this.queue.then(() => this.disposed ? undefined : operation());
    // A failed render must not poison subsequent valid imports/operations.
    this.queue = result.catch((error) => this.onError(error));
    return result;
  }

  setData(input) {
    const model = adaptAnalysis(input); // Validate before changing the current view.
    return this.run(async () => {
      this.model = model;
      this.expanded.clear();
      this.cards.clear();
      this.selected = null;
      this.graph.setData({ nodes: model.nodes.map((node) => ({ id: node.id })), edges: displayEdges(model) });
      await this.graph.render();
      if (model.nodes.length) await this.graph.fitView({ when: 'always' }, false);
      this.onSelect(null);
      this.onChange(model);
    });
  }

  createCard(id) {
    if (this.cards.has(id)) return this.cards.get(id);
    const node = this.model.nodes.find((item) => item.id === id);
    const card = document.createElement('div');
    card.className = 'character-card';
    card.dataset.nodeId = id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `查看人物：${node.name}`);
    card.setAttribute('aria-pressed', 'false');
    card.title = [node.name, node.aliases.join('、'), node.description].filter(Boolean).join('\n');
    const avatar = document.createElement('span');
    avatar.className = 'character-avatar';
    avatar.textContent = Array.from(node.name)[0];
    const avatarUrl = safeAvatarUrl(node.avatar);
    if (avatarUrl) {
      const image = document.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove(), { once: true });
      image.src = avatarUrl;
      avatar.append(image);
    }
    const heading = document.createElement('div');
    heading.className = 'character-heading';
    const name = document.createElement('strong');
    name.textContent = node.name;
    const aliases = document.createElement('span');
    aliases.textContent = node.aliases.length ? node.aliases.join(' / ') : '人物';
    heading.append(name, aliases);
    const description = document.createElement('p');
    description.textContent = node.description || '暂无人物简介';
    card.append(avatar, heading, description);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.selectNode(id);
      }
    });
    this.cards.set(id, card);
    return card;
  }

  selectNode(id, focus = false) {
    return this.run(async () => {
      const node = this.model?.nodes.find((item) => item.id === id);
      if (!node) return;
      await this.resetStates();
      this.selected = { type: 'node', id };
      this.cards.get(id)?.setAttribute('aria-pressed', 'true');
      const related = this.model.relations.filter((r) => r.source === id || r.target === id);
      const states = Object.fromEntries(this.graph.getEdgeData()
        .filter((edge) => edge.source === id || edge.target === id).map((edge) => [edge.id, ['selected']]));
      await this.graph.setElementState(states, false);
      if (focus) await this.graph.focusElement(id, false);
      this.onSelect({ type: 'node', node, relations: related });
    });
  }

  selectEdge(id) {
    return this.run(async () => {
      const edge = this.graph.getEdgeData().find((item) => item.id === id);
      if (!edge) return;
      const group = this.model.groups.get(edge.data.groupId);
      if (edge.data.aggregate) {
        this.expanded.add(group.id);
        await this.drawEdges();
      }
      await this.resetStates();
      const selected = edge.data.aggregate
        ? displayEdges(this.model, this.expanded).filter((item) => item.data.groupId === group.id)
        : [edge];
      await this.graph.setElementState(Object.fromEntries(selected.map((item) => [item.id, ['selected']])), false);
      this.selected = { type: 'group', id: group.id };
      this.onSelect({ type: 'group', group, relationId: edge.data.relationId });
      this.onChange(this.model);
    });
  }

  hoverEdge(id, active) {
    return this.run(async () => {
      if (!this.graph.getEdgeData().some((edge) => edge.id === id)) return;
      const states = this.graph.getElementState(id).filter((state) => state !== 'active');
      if (active) states.push('active');
      await this.graph.setElementState(id, states, false);
    });
  }

  async resetStates() {
    for (const card of this.cards.values()) card.setAttribute('aria-pressed', 'false');
    await this.graph.setElementState(Object.fromEntries(this.graph.getEdgeData().map((edge) => [edge.id, []])), false);
  }

  clearSelection() {
    return this.run(async () => {
      await this.resetStates();
      this.selected = null;
      this.onSelect(null);
    });
  }

  async drawEdges() {
    // Drawing (not rendering) keeps layout, user-dragged positions and viewport.
    this.graph.setData({ nodes: this.graph.getNodeData(), edges: displayEdges(this.model, this.expanded) });
    await this.graph.draw();
  }

  toggleGroup(id) {
    return this.run(async () => {
      if (!this.model?.groups.has(id)) return;
      if (this.expanded.has(id)) this.expanded.delete(id);
      else this.expanded.add(id);
      await this.drawEdges();
      this.selected = null;
      await this.resetStates();
      this.onSelect({ type: 'group', group: this.model.groups.get(id) });
      this.onChange(this.model);
    });
  }

  setExpanded(expand) {
    return this.run(async () => {
      if (!this.model) return;
      this.expanded = expand ? new Set(this.model.groups.keys()) : new Set();
      await this.drawEdges();
      this.selected = null;
      await this.resetStates();
      this.onSelect(null);
      this.onChange(this.model);
    });
  }

  fit() {
    return this.run(() => this.model?.nodes.length ? this.graph.fitView({ when: 'always' }, false) : undefined);
  }

  relayout() {
    return this.run(async () => {
      if (!this.model?.nodes.length) return;
      await this.graph.layout();
      await this.graph.fitView({ when: 'always' }, false);
    });
  }

  zoom(ratio) {
    return this.run(() => this.graph.zoomBy(ratio, false));
  }

  destroy() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    // Wait for any in-flight asynchronous G6 work before disposing its canvas.
    return this.queue.finally(() => this.graph.destroy());
  }
}
