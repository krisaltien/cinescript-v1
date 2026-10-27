import { z } from 'zod';
import { RawStoryAnalysisSchema, type StructuredStory } from '../domain/schema.js';

// The model supplies semantic claims and short quotes; the application owns offsets.
const DraftEvidenceSchema = RawStoryAnalysisSchema.shape.evidences.element.omit({span:true})
  .extend({quote:z.string().min(1).max(200)});
export const AgentDraftSchema = RawStoryAnalysisSchema.omit({schema_version:true,document_id:true})
  .extend({evidences:z.array(DraftEvidenceSchema)});

export function resolveDraft(value: unknown, story: StructuredStory) {
  if(typeof value==='object' && value!==null && 'document_id' in value && value.document_id!==story.document.id)
    throw new Error('document_id mismatch');
  const draft=AgentDraftSchema.parse(value);
  const paragraphs=new Map(story.paragraphs.map(p=>[p.id,p]));
  const evidences=draft.evidences.map(e=>{
    const p=paragraphs.get(e.paragraph_id);
    if(!p) throw new Error(`Evidence ${e.id}: unknown paragraph ${e.paragraph_id}`);
    const offset=p.text.indexOf(e.quote);
    if(offset<0) throw new Error(`Evidence ${e.id}: quote is not an exact substring of ${p.id}; copy verbatim.`);
    if(p.text.indexOf(e.quote,offset+1)>=0) throw new Error(`Evidence ${e.id}: quote occurs more than once in ${p.id}; extend it to uniquely identify the passage.`);
    return {...e,span:{start:p.span.start+offset,end:p.span.start+offset+e.quote.length}};
  });
  return {...draft,schema_version:'1.0' as const,document_id:story.document.id,evidences};
}
