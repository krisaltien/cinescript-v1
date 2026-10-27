import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const analysis = JSON.parse(await readFile(process.argv[2], 'utf8'));
const outDir = process.argv[3];
await mkdir(outDir, { recursive: true });
const ids = new Map();
const topics = analysis.characters.map((c) => {
  const id = randomUUID(); ids.set(c.id, id);
  return { id, title: c.name, children: { attached: [] }, notes: { plain: { content: `${c.aliases?.length ? `别名：${c.aliases.join('、')}\n` : ''}${c.description}` } } };
});
const relationships = analysis.relations.filter(r => ids.has(r.source_character_id) && ids.has(r.target_character_id)).map(r => ({ id: randomUUID(), end1Id: ids.get(r.source_character_id), end2Id: ids.get(r.target_character_id), title: `${r.type}：${r.description}` }));
const content = { version: '1.0.3', docId: randomUUID(), rootTopic: { id: randomUUID(), title: '《色，戒》人物关系图', children: { attached: topics } }, relationships };
await writeFile(`${outDir}/content.json`, JSON.stringify(content, null, 2));
await writeFile(`${outDir}/metadata.json`, JSON.stringify({ creator: { name: 'CineScript' }, title: '《色，戒》人物关系图' }, null, 2));
await writeFile(`${outDir}/manifest.json`, JSON.stringify({ 'file-entries': { 'content.json': {}, 'metadata.json': {} } }, null, 2));
