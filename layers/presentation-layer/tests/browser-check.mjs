// Browser integration checks; pass a Playwright Page (including the Pi MCP page).
// No application test hooks or global graph internals are exposed in production.
import assert from 'node:assert/strict';
import { analysisFixture } from './fixtures.mjs';

export async function runBrowserChecks(page, { url = 'http://127.0.0.1:4173', screenshotDir } = {}) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let generation = 0;
  const upload = async (data) => {
    const name = `前端测试-${++generation}.json`;
    await page.locator('#json-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await page.locator('#source-name').filter({ hasText: name }).waitFor();
    await page.locator('#status').filter({ hasText: '图谱已就绪' }).waitFor();
  };
  const card = (id) => page.locator(`.character-card[data-node-id="character:${id}"]`);
  const stats = () => page.locator('#stats').textContent();
  const settleCanvas = () => page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const bounds = () => page.locator('.character-card').evaluateAll((cards) => cards.map((node) => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { id: node.dataset.nodeId, x, y, width, height };
  }));

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(url);
  await page.locator('#json-file').waitFor();
  assert.equal(await page.locator('#empty-state').isVisible(), true);
  await upload(analysisFixture());
  assert.equal(await page.locator('.character-card').count(), 4);
  assert.match(await stats(), /4 个人物 · 6 条关系 · 3 条可见连线/);
  const initial = await bounds();
  for (let i = 0; i < initial.length; i++) {
    for (let j = i + 1; j < initial.length; j++) {
      const a = initial[i], b = initial[j];
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'automatic layout must not overlap HTML cards');
    }
  }
  await card('a').click();
  await page.locator('#details h2').filter({ hasText: '王佳芝' }).waitFor();
  assert.match(await page.locator('#details').textContent(), /反向关系/);
  const [a, b] = await Promise.all([card('a').boundingBox(), card('b').boundingBox()]);
  // The collapsed pair is a straight, centered quadratic edge.
  await page.mouse.click((a.x + a.width / 2 + b.x + b.width / 2) / 2, (a.y + a.height / 2 + b.y + b.height / 2) / 2);
  await page.locator('#details button').filter({ hasText: '折叠 3 条关系' }).waitFor();
  assert.match(await stats(), /5 条可见连线/);
  const afterExpand = await bounds();
  assert.deepEqual(afterExpand, initial, 'expansion must preserve node positions and viewport');
  await page.locator('#details button').filter({ hasText: '折叠 3 条关系' }).click();
  await page.locator('#details button').filter({ hasText: '展开 3 条关系' }).waitFor();
  assert.match(await stats(), /3 条可见连线/);
  await page.locator('#expand').click();
  await page.waitForFunction(() => document.querySelector('#stats').textContent.includes('6 条可见连线'));
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/desktop.png`, fullPage: true });
  await page.locator('#collapse').click();
  await page.waitForFunction(() => document.querySelector('#stats').textContent.includes('3 条可见连线'));

  const beforeZoom = await card('a').boundingBox();
  await page.locator('#zoom-in').click();
  await page.waitForFunction((width) => document.querySelector('[data-node-id="character:a"]').getBoundingClientRect().width > width * 1.1, beforeZoom.width);
  assert.ok((await card('a').boundingBox()).width > beforeZoom.width * 1.1);
  await page.locator('#fit').click();
  await settleCanvas();
  const beforeDrag = await card('a').boundingBox();
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + 20);
  await page.mouse.down();
  // G6 intentionally requires a 100ms press and 10px movement to start dragging.
  await page.waitForTimeout(120);
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2 + 45, beforeDrag.y + 45, { steps: 8 });
  await page.mouse.up();
  const afterDrag = await card('a').boundingBox();
  assert.ok(Math.abs(afterDrag.x - beforeDrag.x) > 25, 'HTML card dragging must update its position');
  await page.locator('#relayout').click();
  await page.waitForFunction(({ id, x }) => Math.abs(document.querySelector(`[data-node-id="${id}"]`).getBoundingClientRect().x - x) > 15,
    { id: 'character:a', x: afterDrag.x });
  await settleCanvas();

  const beforePan = await card('a').boundingBox();
  const canvas = await page.locator('#graph').boundingBox();
  await page.mouse.move(canvas.x + 10, canvas.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(120); // Model a real press past G6's drag threshold.
  await page.mouse.move(canvas.x + 50, canvas.y + 40, { steps: 8 });
  await page.mouse.up();
  const afterPan = await card('a').boundingBox();
  assert.ok(afterPan.x > beforePan.x + 10 && afterPan.y > beforePan.y + 5, 'blank-canvas dragging must pan the viewport');

  await card('isolated').focus();
  await page.keyboard.press('Enter');
  await page.locator('#details h2').filter({ hasText: '无关系人物' }).waitFor();
  assert.match(await page.locator('#details').textContent(), /0 条相关关系/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#fit').click();
  await settleCanvas();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/mobile.png`, fullPage: true });

  // Re-import with changed counts and the same IDs, then exercise empty/error recovery.
  const changed = analysisFixture();
  changed.characters.push({ id: 'new', name: '新人物' });
  changed.relations.push({ id: 'new-relation', source_character_id: 'new', target_character_id: 'c', type: '新增关系' });
  await upload(changed);
  await page.waitForFunction(() => document.querySelectorAll('.character-card').length === 5);
  assert.match(await stats(), /5 个人物 · 7 条关系/);
  await upload({ characters: [], relations: [] });
  assert.equal(await page.locator('.character-card').count(), 0);
  assert.equal(await page.locator('#empty-state').isVisible(), true);

  const malicious = analysisFixture();
  malicious.characters[0].name = '<img src=x onerror="window.__xss=true">';
  malicious.characters[0].avatar = 'javascript:alert(1)';
  malicious.characters[1].avatar = 'http://127.0.0.1:4173/missing-avatar.png';
  await upload(malicious);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await card('a').locator('img').count(), 0);
  assert.match(await card('a').textContent(), /<img src=x/);
  await page.locator('#json-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await page.locator('#error').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.character-card').count(), 4, 'invalid import must not discard the current graph');
  await upload(analysisFixture());
  assert.equal(await page.locator('#error').isVisible(), false);
  assert.deepEqual(errors, []);
  return { passed: ['automatic layout/no overlap', 'all nodes including isolated', 'canvas edge click/expand/collapse', 'independent reverse relations/details', 'stable expansion', 'zoom', 'HTML node drag', 'canvas panning', 'relayout', 'keyboard card selection', 'mobile/no overflow', 'data update', 'empty state', 'safe text/avatar rendering', 'invalid import recovery'], pageErrors: errors };
}
