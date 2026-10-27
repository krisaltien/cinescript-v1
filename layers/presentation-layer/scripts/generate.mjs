import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAssets } from './build.mjs';
import { createHtml } from './html.mjs';
import { adaptAnalysis } from '../src/graph-data.js';

export async function generateRelationshipHtml(inputPath, outputPath) {
  if (!inputPath || !outputPath) throw new Error('用法：node build_relation_web.mjs <analysis.json> <output.html>');
  let input;
  try {
    input = JSON.parse(await readFile(inputPath, 'utf8'));
  } catch (cause) {
    throw new Error(`无法读取分析 JSON：${inputPath}。请检查文件路径和 JSON 格式。`, { cause });
  }
  const model = adaptAnalysis(input);
  const assets = await buildAssets();
  const title = input.document?.title ? `${input.document.title} · 人物关系图谱` : 'CineScript · 人物关系图谱';
  // Embed the original JSON, not an altered/filtered domain model.
  const html = createHtml({ ...assets, data: input, title });
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, html);
  return { nodes: model.nodes.length, relations: model.relations.length, warnings: model.warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await generateRelationshipHtml(process.argv[2], process.argv[3]);
  console.log(`已生成 ${process.argv[3]}：${result.nodes} 个人物，${result.relations} 条关系。`);
  for (const warning of result.warnings) console.warn(warning);
}
