import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHtml, serializeJson } from '../scripts/html.mjs';

test('JSON embedding is lossless and cannot break out of its non-executable script tag', () => {
  const raw = { characters: [{ id: 'a', name: '</script><img src=x onerror=alert(1)>', description: '<>&\u2028\u2029' }], relations: [] };
  const serialized = serializeJson(raw);
  assert.equal(serialized.includes('<'), false);
  assert.deepEqual(JSON.parse(serialized), raw);
  const html = createHtml({ data: raw, script: 'console.log("</script>")', css: 'body{}', title: '<故事 & 人物>' });
  assert.equal(html.match(/<\/script>/g).length, 2);
  assert.ok(html.includes('&lt;故事 &amp; 人物&gt;'));
  assert.ok(!html.includes('<img'));
});

test('frontend without initial data remains a self-contained JSON importer', () => {
  const html = createHtml({ script: '/* bundled G6 */', css: 'body{}' });
  assert.ok(!html.includes('id="analysis-data"'));
  assert.ok(html.includes('lang="zh-CN"'));
  assert.ok(!html.includes('<script src='));
  assert.ok(!html.includes('<link'));
});
