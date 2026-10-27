import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist/skills',{recursive:true});
cpSync('skills','dist/skills',{recursive:true});
