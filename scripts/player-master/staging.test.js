import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const require=createRequire(import.meta.url);
const { resolveStagingOutput, writeStagedFile }=require('./staging.cjs');
it('refuses absent outputs and source paths before any network work',()=>{
 expect(()=>resolveStagingOutput([],process.cwd())).toThrow(/output/);
 expect(()=>resolveStagingOutput(['--output=src/data/npb2025.js'],process.cwd())).toThrow(/source/);
 expect(()=>resolveStagingOutput(['--output=src/data/../data/new.js'],process.cwd())).toThrow(/source/);
 expect(resolveStagingOutput(['--dry-run'],process.cwd())).toBeNull();
});
it('writes a candidate once and never overwrites a previous candidate',()=>{
 const dir=mkdtempSync(join(tmpdir(),'player-stage-')),file=join(dir,'candidate.json');
 try {writeStagedFile(file,'first');expect(()=>writeStagedFile(file,'second')).toThrow();expect(readFileSync(file,'utf8')).toBe('first');}
 finally {rmSync(dir,{recursive:true,force:true});}
});
