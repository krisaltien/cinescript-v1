import type { StructuredStory, RawStoryAnalysis } from '../domain/schema.js';
// An explicit fixture, never a substitute for model analysis.
export function demoAnalysis(story:StructuredStory):RawStoryAnalysis {
 const p=story.paragraphs[0];
 return {schema_version:'1.0',document_id:story.document.id,characters:[],events:[{id:'ev_demo',summary:'Offline demo: source paragraph captured; semantic analysis has not run.',participant_ids:[],evidence_ids:['e_demo'],unresolved:['Run Pi mode for character/event/relationship extraction.']}],relations:[],timeline_constraints:[],evidences:[{id:'e_demo',paragraph_id:p.id,quote:p.text,span:{...p.span}}],warnings:['DEMO_ONLY: deterministic plumbing fixture, not LLM analysis.']};
}
