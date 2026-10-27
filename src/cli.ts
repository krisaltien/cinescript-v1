import { parseArgs } from 'node:util';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { ingestFile, parseStory, type ParagraphMode } from './source/parser.js';
import type { PiOptions, CallMetrics } from './agent/pi.js';
import { analyze } from './agent/orchestrator.js';
import { demoAnalysis } from './agent/demo.js';
import { validateAnalysis } from './validation/index.js';
async function main() {
 const {values:v}=parseArgs({options:{input:{type:'string'},text:{type:'string'},stdin:{type:'boolean'},title:{type:'string'},format:{type:'string',default:'txt'},mode:{type:'string',default:'pi'},provider:{type:'string'},model:{type:'string'},out:{type:'string',default:'artifacts/run'},paragraphs:{type:'string'},thinking:{type:'string',default:'low'},'timeout-ms':{type:'string',default:'300000'},help:{type:'boolean'}}});
 if(v.help){console.log('CineScript: --input story.txt|md|rtf | --text "story" | --stdin [--format txt|markdown] [--title Title] --mode pi|demo [--provider NAME --model ID] [--paragraphs lines|blank-lines] [--thinking off|minimal|low|medium|high] [--timeout-ms 300000] [--out EMPTY_DIR]');return;}
 if([v.input!==undefined,v.text!==undefined,!!v.stdin].filter(Boolean).length!==1)throw new Error('Choose exactly one of --input, --text, --stdin');
 if(!['pi','demo'].includes(v.mode!))throw new Error('Mode must be pi or demo');
 if(!['txt','markdown'].includes(v.format!))throw new Error('Format must be txt or markdown');
 if(v.paragraphs&&!['lines','blank-lines'].includes(v.paragraphs))throw new Error('Paragraph mode must be lines or blank-lines');
 if(!['off','minimal','low','medium','high'].includes(v.thinking!))throw new Error('Invalid thinking level');
 const timeoutMs=Number(v['timeout-ms']);
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000)throw new Error('timeout-ms must be an integer >= 1000');
 const out=resolve(v.out!);await mkdir(out,{recursive:true});
 if((await readdir(out)).length)throw new Error('Output directory is not empty; choose a new --out directory to preserve prior results');
 const started=Date.now();
 let text=v.text;
 if(v.stdin){process.stdin.setEncoding('utf8');text='';for await(const chunk of process.stdin)text+=chunk;}
 const paragraphMode=v.paragraphs as ParagraphMode|undefined;
 const story=v.input?await ingestFile(v.input,paragraphMode):parseStory(text!,v.title,v.format as 'txt'|'markdown',paragraphMode);
 const configuredProvider=v.provider??process.env.CINESCRIPT_PROVIDER??'openai';
 const configuredModel=v.model??process.env.CINESCRIPT_MODEL??'gpt-6-astra';
 await writeFile(resolve(out,'structured_story.json'),JSON.stringify(story,null,2)+'\n');
 const manifest={mode:v.mode,provider:v.mode==='pi'?configuredProvider:null,model:v.mode==='pi'?configuredModel:null,thinking:v.mode==='pi'?v.thinking:null,timeout_ms:timeoutMs,document_id:story.document.id,content_hash:story.document.content_hash,paragraph_mode:paragraphMode??(v.input&&extname(v.input).toLowerCase()==='.rtf'?'lines':'blank-lines'),paragraph_count:story.paragraphs.length,source_chars:story.document.text.length,status:'running',validated:false,created_at:new Date().toISOString(),elapsed_ms:0,error:null as string|null,calls:[] as CallMetrics[]};
 await writeFile(resolve(out,'run_manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 try {
  let result;
  if(v.mode==='demo')result=validateAnalysis(demoAnalysis(story),story);
  else {
   const {createPiAgent}=await import('./agent/pi.js');
   const agent=await createPiAgent(configuredProvider,configuredModel,{thinking:v.thinking as PiOptions['thinking'],timeoutMs,diagnosticsDir:resolve(out,'diagnostics'),onProgress:message=>console.error(message)});
   try{result=await analyze(story,agent);}finally{manifest.calls=agent.metrics;agent.dispose();}
  }
  await writeFile(resolve(out,'raw_story_analysis.json'),JSON.stringify(result,null,2)+'\n');
  manifest.status='completed';manifest.validated=true;
  console.log(`Validated ${v.mode} output: ${out}/raw_story_analysis.json`);
 }catch(error){manifest.status='failed';manifest.error=String(error);throw error;}
 finally{manifest.elapsed_ms=Date.now()-started;await writeFile(resolve(out,'run_manifest.json'),JSON.stringify(manifest,null,2)+'\n');}
}
main().catch(e=>{console.error(`CineScript: ${e instanceof Error?e.message:String(e)}`);process.exitCode=1;});
