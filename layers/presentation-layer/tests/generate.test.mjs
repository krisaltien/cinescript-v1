import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { analysisFixture } from './fixtures.mjs';
import { generateRelationshipHtml } from '../scripts/generate.mjs';

const exec = promisify(execFile);
test('original frontend CLI generates an offline HTML containing every original JSON record', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cinescript-graph-'));
  try {
    const raw = analysisFixture();
    raw.characters[0].name = '</script><img src=x onerror=alert(1)>';
    const original = JSON.stringify(raw);
    const input = path.join(dir, 'analysis.json');
    const output = path.join(dir, 'nested', 'relationships.html');
    await writeFile(input, original);
    const cli = fileURLToPath(new URL('../../llm-layer/v1/build_relation_web.mjs', import.meta.url));
    const { stdout } = await exec(process.execPath, [cli, input, output]);
    assert.match(stdout, /4 个人物，6 条关系/);
    const html = await readFile(output, 'utf8');
    const serialized = html.match(/<script id="analysis-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(serialized), raw);
    assert.equal(html.match(/<\/script>/g).length, 2);
    assert.equal(html.includes('<script src='), false);
    assert.ok(html.includes('character-card'));
    assert.equal(await readFile(input, 'utf8'), original);
    await writeFile(input, '{broken');
    await assert.rejects(generateRelationshipHtml(input, output), /无法读取分析 JSON/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
