import { RawStoryAnalysisSchema, type StructuredStory, type RawStoryAnalysis } from '../domain/schema.js';
export function validateAnalysis(value: unknown, story: StructuredStory): RawStoryAnalysis {
 const a=RawStoryAnalysisSchema.parse(value); const errors:string[]=[];
 if(a.document_id!==story.document.id) errors.push('document_id mismatch');
 const groups=[a.characters,a.events,a.relations,a.timeline_constraints,a.evidences];
 const all=new Set<string>(); for(const g of groups) for(const x of g) {if(all.has(x.id)) errors.push(`duplicate id: ${x.id}`); all.add(x.id);}
 const chars=new Set(a.characters.map(x=>x.id)), events=new Set(a.events.map(x=>x.id)), evidences=new Set(a.evidences.map(x=>x.id));
 const ref=(set:Set<string>, id:string)=>{if(!set.has(id)) errors.push(`dangling reference: ${id}`);};
 for(const g of groups.slice(0,4)) for(const item of g) {
  const x=item as {id:string;evidence_ids:string[];unresolved?:string[]};
  x.evidence_ids.forEach(id=>ref(evidences,id));
  if(!x.evidence_ids.length&&!x.unresolved?.length) errors.push(`unsupported claim: ${x.id}; supply evidence or unresolved reason`);
 }
 for(const e of a.evidences) {
  const p=story.paragraphs.find(p=>p.id===e.paragraph_id);
  if(!p||e.span.start<p.span.start||e.span.end>p.span.end||e.span.end<=e.span.start||story.document.text.slice(e.span.start,e.span.end)!==e.quote) errors.push(`invalid source evidence: ${e.id}`);
 }
 a.events.forEach(e=>e.participant_ids.forEach(id=>ref(chars,id)));
 a.relations.forEach(r=>{ref(chars,r.source_character_id);ref(chars,r.target_character_id);r.event_ids.forEach(id=>ref(events,id));});
 const edges=new Map<string,string[]>();
 a.timeline_constraints.forEach(t=>{ref(events,t.from_event_id);ref(events,t.to_event_id);if(t.type==='before'||t.type==='after'){const [x,y]=t.type==='before'?[t.from_event_id,t.to_event_id]:[t.to_event_id,t.from_event_id];edges.set(x,[...(edges.get(x)??[]),y]);}});
 const visiting=new Set<string>(),done=new Set<string>();
 function visit(x:string):boolean {if(visiting.has(x))return true;if(done.has(x))return false;visiting.add(x);for(const y of edges.get(x)??[])if(visit(y))return true;visiting.delete(x);done.add(x);return false;}
 if([...edges.keys()].some(visit))errors.push('timeline contains a strict ordering cycle');
 if(errors.length)throw new Error(errors.join('\n'));
 return a;
}
