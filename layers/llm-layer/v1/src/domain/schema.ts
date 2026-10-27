import { z } from 'zod';
const id = z.string().min(1);
export const SourceSpanSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() });
export const StructuredStorySchema = z.object({
  schema_version: z.literal('1.0'),
  document: z.object({ id, title: z.string(), format: z.enum(['txt','markdown']), text: z.string().min(1), content_hash: z.string(), offset_unit: z.literal('utf16') }),
  chapters: z.array(z.object({ id, title: z.string(), span: SourceSpanSchema, paragraph_ids: z.array(id) })),
  paragraphs: z.array(z.object({ id, chapter_id: id, text: z.string().min(1), span: SourceSpanSchema })).min(1),
});
const uncertainty = { confidence: z.number().min(0).max(1).optional(), alternatives: z.array(z.string()).optional(), unresolved: z.array(z.string()).optional() };
const claim = { id, evidence_ids: z.array(id), ...uncertainty };
export const RawStoryAnalysisSchema = z.object({
  schema_version: z.literal('1.0'), document_id: id,
  characters: z.array(z.object({ ...claim, name: z.string().min(1), aliases: z.array(z.string()), description: z.string() })),
  events: z.array(z.object({ ...claim, summary: z.string(), participant_ids: z.array(id) })),
  relations: z.array(z.object({ ...claim, source_character_id: id, target_character_id: id, type: z.string(), description: z.string(), event_ids: z.array(id) })),
  timeline_constraints: z.array(z.object({ ...claim, from_event_id: id, to_event_id: id, type: z.enum(['before','after','simultaneous','unknown']) })),
  evidences: z.array(z.object({ id, paragraph_id: id, quote: z.string().min(1), span: SourceSpanSchema, ...uncertainty })),
  warnings: z.array(z.string()), ...uncertainty,
});
export type StructuredStory = z.infer<typeof StructuredStorySchema>;
export type RawStoryAnalysis = z.infer<typeof RawStoryAnalysisSchema>;
export type SourceSpan = z.infer<typeof SourceSpanSchema>;
export const rawAnalysisJsonSchema = z.toJSONSchema(RawStoryAnalysisSchema);
