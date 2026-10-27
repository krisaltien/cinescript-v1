# CineScript

CineScript is a layered story-analysis system. The current implementation lives in `layers/llm-layer/v1`.

```text
Source Layer → LLM Layer → Domain Layer → Temporal Layer → Graph Layer → Presentation Layer
```

## Layers

- `layers/source-layer`: source ingestion, parsing, paragraphs, chapters, and source spans.
- `layers/llm-layer/v1`: the current Pi-based extraction pipeline, skills, schemas, raw agent output, and validation.
- `layers/domain-layer`: planned canonical entities and domain invariants.
- `layers/temporal-layer`: planned chronology, periods, and temporal anchors.
- `layers/graph-layer`: planned character and event graph models.
- `layers/presentation-layer`: relationship graphs, timelines, and export formats.

The current LLM layer still ends at validated `RawStoryAnalysis`; downstream layers are intentionally separate extension points.
