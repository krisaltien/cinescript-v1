import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { StructuredStorySchema, type StructuredStory } from '../domain/schema.js';
export type ParagraphMode = 'blank-lines' | 'lines';
export function parseStory(text: string, title = 'Untitled', format: 'txt' | 'markdown' = 'txt', paragraphMode: ParagraphMode = 'blank-lines'): StructuredStory {
  if (!text.trim()) throw new Error('Story is empty');
  const hash = createHash('sha256').update(text).digest('hex');
  const chapters: StructuredStory['chapters'] = [];
  const paragraphs: StructuredStory['paragraphs'] = [];
  let current: StructuredStory['chapters'][number] | undefined;
  let pending: {start: number; end: number} | undefined;
  const chapter = (name: string, start: number) => {
    if (current) current.span.end = start;
    current = {id: `ch_${chapters.length+1}`, title:name, span:{start,end:text.length},paragraph_ids:[]}; chapters.push(current);
  };
  const flush = () => {
    if (!pending) return;
    if (!current) chapter(title, 0);
    const p = {id:`p_${paragraphs.length+1}`,chapter_id:current!.id,text:text.slice(pending.start,pending.end),span:pending};
    paragraphs.push(p); current!.paragraph_ids.push(p.id); pending=undefined;
  };
  for (const match of text.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
    const line = match[0].replace(/[\r\n]+$/, '');
    const start = match.index!;
    const heading = (format==='markdown' && /^#{1,6}\s+(.+)$/.exec(line)) || /^(第[零一二三四五六七八九十百千万\d]+[章节回部].*|Chapter\s+\d+.*)$/i.exec(line);
    if (heading) { flush(); chapter(heading[1],start); }
    else if (!line.trim()) flush();
    else { pending = {start:pending?.start ?? start, end:start+line.length}; if(paragraphMode==='lines') flush(); }
  }
  flush();
  if (!paragraphs.length) throw new Error('Story has headings but no narrative paragraphs');
  return StructuredStorySchema.parse({schema_version:'1.0',document:{id:`doc_${hash.slice(0,16)}`,title,format,text,content_hash:hash,offset_unit:'utf16'},chapters,paragraphs});
}
export async function ingestFile(path: string, paragraphMode?: ParagraphMode) {
  const ext=extname(path).toLowerCase();
  if(ext==='.rtf') {
    if(process.platform!=='darwin') throw new Error('RTF ingestion requires macOS textutil; convert to UTF-8 txt on other platforms.');
    const {stdout}=await promisify(execFile)('/usr/bin/textutil',['-convert','txt','-stdout',path],{encoding:'utf8',maxBuffer:16*1024*1024});
    return parseStory(stdout,basename(path),'txt',paragraphMode??'lines');
  }
  if (!['.txt','.md','.markdown'].includes(ext)) throw new Error('Supported files: .txt, .md, .markdown');
  return parseStory(await readFile(path,'utf8'),basename(path),ext==='.txt'?'txt':'markdown',paragraphMode);
}
