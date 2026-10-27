import { RelationshipGraph } from './relationship-graph.js';
import './styles.css';

const app = document.getElementById('app');
app.innerHTML = `
  <header class="app-header">
    <div class="title-block"><h1>人物关系图谱</h1><p id="source-name">打开已有分析 JSON，自动生成人物网络</p></div>
    <label class="button button-primary file-button">打开 JSON<input id="json-file" type="file" accept=".json,application/json"></label>
  </header>
  <main class="workspace">
    <section class="graph-region" aria-label="交互式人物关系图">
      <div class="graph-toolbar" role="toolbar" aria-label="图谱工具">
        <button id="fit" disabled>适应画布</button><button id="relayout" disabled>重新布局</button>
        <span class="toolbar-divider"></span>
        <button id="expand" disabled>展开全部</button><button id="collapse" disabled>折叠全部</button>
        <div class="zoom-controls"><button id="zoom-out" aria-label="缩小" disabled>−</button><button id="zoom-in" aria-label="放大" disabled>+</button></div>
      </div>
      <div id="graph" aria-label="可拖动人物卡片；在空白区域拖动平移，滚轮缩放"></div>
      <div id="empty-state" class="empty-state"><h2>从人物，看见故事的联系</h2><p>选择已有的 JSON 分析结果。无需坐标，人物和关系将自动排列。</p><p class="format-hint">支持 characters / relations 字段</p></div>
      <div class="graph-footer"><span id="stats">尚未加载数据</span><span>拖动卡片 · 空白处平移 · 滚轮缩放</span></div>
    </section>
    <aside class="sidebar" aria-label="人物与关系详情">
      <section id="details" class="details"><h2>人物与关系</h2><p class="muted">点击人物查看简介，点击连线查看关系。多重关系可展开或折叠，不会改动原始数据。</p></section>
      <section class="directory"><h2>角色列表 <span id="character-count"></span></h2><div id="character-list"><p class="muted">导入后，所有有效人物都会显示在这里。</p></div></section>
    </aside>
  </main>
  <div class="message-area"><p id="status" role="status" aria-live="polite"></p><p id="error" role="alert" hidden></p><details id="warnings" hidden><summary></summary><ul></ul></details></div>`;

const $ = (selector) => app.querySelector(selector);
const details = $('#details');
let currentModel;
const view = new RelationshipGraph($('#graph'), {
  onSelect: showSelection,
  onChange: updateSummary,
  onError: showError,
});

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showError(error) {
  $('#error').hidden = false;
  $('#error').textContent = `无法显示图谱：${error.message || error}。请检查文件后重新打开。`;
}

function nodeName(id) {
  return currentModel.nodes.find((node) => node.id === id)?.name || id;
}

function relationItem(relation, selectedId) {
  const item = element('article', '', 'relation-detail');
  if (relation.id === selectedId) item.classList.add('is-selected');
  const direction = `${nodeName(relation.source)} ${relation.bidirectional ? '↔' : '→'} ${nodeName(relation.target)}`;
  item.append(element('p', direction, 'relation-direction'), element('h3', relation.label));
  if (relation.description && relation.description !== relation.label) item.append(element('p', relation.description));
  item.append(element('small', `关系 ID：${relation.originalId || '未提供'} · 独立记录 ${relation.id.split(':')[1]}`));
  return item;
}

function groupControl(group) {
  const button = element('button', view.expanded.has(group.id) ? `折叠 ${group.relations.length} 条关系` : `展开 ${group.relations.length} 条关系`, 'group-control');
  button.setAttribute('aria-expanded', String(view.expanded.has(group.id)));
  button.addEventListener('click', () => perform(() => view.toggleGroup(group.id)));
  return button;
}

function showSelection(selection) {
  details.replaceChildren();
  if (!selection) {
    details.append(element('h2', '人物与关系'), element('p', '点击人物卡片查看完整简介；点击连线查看方向和关系文字。多条关系默认聚合，展开后仍各自独立。', 'muted'));
    return;
  }
  if (selection.type === 'node') {
    const { node, relations } = selection;
    details.append(element('h2', node.name));
    if (node.aliases.length) details.append(element('p', `别名：${node.aliases.join('、')}`, 'muted'));
    details.append(element('p', node.description || '暂无人物简介'), element('h3', `${relations.length} 条相关关系`));
    if (!relations.length) details.append(element('p', '该人物暂时没有关系记录，仍保留在图谱中。', 'muted'));
    const groups = new Set(relations.map((relation) => relation.groupId));
    for (const id of groups) {
      const group = currentModel.groups.get(id);
      if (group.relations.length > 1) details.append(groupControl(group));
      group.relations.forEach((relation) => details.append(relationItem(relation)));
    }
  } else {
    const { group, relationId } = selection;
    details.append(element('h2', '关系详情'), element('p', `${nodeName(group.pair[0])} / ${nodeName(group.pair[1])}`, 'muted'));
    if (group.relations.length > 1) details.append(groupControl(group));
    group.relations.forEach((relation) => details.append(relationItem(relation, relationId)));
  }
}

function updateSummary(model) {
  currentModel = model;
  const visibleCount = view.graph.getEdgeData().length;
  $('#stats').textContent = `${model.nodes.length} 个人物 · ${model.relations.length} 条关系 · ${visibleCount} 条可见连线`;
  $('#character-count').textContent = model.nodes.length;
  $('#empty-state').hidden = model.nodes.length > 0;
  if (!model.nodes.length) {
    $('#empty-state').replaceChildren(element('h2', '暂无可显示的人物'), element('p', 'JSON 的 characters 数组为空，或没有有效的人物 ID。请打开其他分析结果。'));
  }
  const warningBox = $('#warnings');
  warningBox.hidden = model.warnings.length === 0;
  warningBox.querySelector('summary').textContent = `${model.warnings.length} 条数据提示（点击查看）`;
  warningBox.querySelector('ul').replaceChildren(...model.warnings.map((warning) => element('li', warning)));
  const list = $('#character-list');
  // Only rebuild the directory when input changes, not on every expand/collapse.
  if (list.model !== model) {
    list.model = model;
    list.replaceChildren(...model.nodes.map((node) => {
      const button = element('button', '', 'character-list-item');
      button.append(element('strong', node.name), element('span', node.description || '暂无人物简介'));
      button.addEventListener('click', () => perform(() => view.selectNode(node.id, true)));
      return button;
    }));
  }
  for (const button of app.querySelectorAll('.graph-toolbar button')) button.disabled = !model.nodes.length;
}

async function perform(action) {
  try { await action(); } catch (error) { showError(error); }
}

export async function loadAnalysis(input, filename = '分析结果') {
  $('#error').hidden = true;
  $('#status').textContent = '正在计算布局…';
  try {
    // onSelect runs after render; details need the current model first.
    await view.setData(input);
    $('#source-name').textContent = filename;
    $('#status').textContent = '图谱已就绪';
  } catch (error) {
    $('#status').textContent = '';
    showError(error);
    throw error;
  }
}

$('#json-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const input = JSON.parse(await file.text());
    await loadAnalysis(input, file.name);
  } catch (error) {
    showError(error);
  } finally {
    event.target.value = ''; // Selecting the same corrected file must fire change.
  }
});
$('#fit').addEventListener('click', () => perform(() => view.fit()));
$('#relayout').addEventListener('click', () => perform(() => view.relayout()));
$('#expand').addEventListener('click', () => perform(() => view.setExpanded(true)));
$('#collapse').addEventListener('click', () => perform(() => view.setExpanded(false)));
$('#zoom-in').addEventListener('click', () => perform(() => view.zoom(1.2)));
$('#zoom-out').addEventListener('click', () => perform(() => view.zoom(1 / 1.2)));

const initialData = document.getElementById('analysis-data');
if (initialData) {
  try {
    loadAnalysis(JSON.parse(initialData.textContent), document.title).catch(() => {});
  } catch (error) { showError(error); }
}
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) view.destroy();
});
