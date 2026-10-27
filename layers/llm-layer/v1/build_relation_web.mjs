// Presentation-only entry point; extraction, validation and domain JSON stay unchanged.
import { generateRelationshipHtml } from '../../presentation-layer/scripts/generate.mjs';

try {
  const result = await generateRelationshipHtml(process.argv[2], process.argv[3]);
  console.log(`已生成 ${process.argv[3]}：${result.nodes} 个人物，${result.relations} 条关系。`);
  for (const warning of result.warnings) console.warn(warning);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
