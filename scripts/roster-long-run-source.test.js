import {expect,it} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validationSourceHashes,assertValidationSourcesUnchanged} from './roster-long-run-source.mjs';

it('detects changes to transitive saves, new source files and dependency locks at the same HEAD',()=>{
 const root=mkdtempSync(join(tmpdir(),'roster-source-'));
 mkdirSync(join(root,'src/engine'),{recursive:true});mkdirSync(join(root,'scripts'));
 const save=join(root,'src/engine/saveload.js'),lock=join(root,'package-lock.json');
 writeFileSync(save,'original save logic');writeFileSync(lock,'original lock');
 const frozen=validationSourceHashes(root);expect(frozen['src/engine/saveload.js']).toBeTypeOf('string');
 expect(()=>assertValidationSourcesUnchanged(frozen,root)).not.toThrow();
 writeFileSync(save,'changed save logic');expect(()=>assertValidationSourcesUnchanged(frozen,root)).toThrow(/source changed/);
 writeFileSync(save,'original save logic');writeFileSync(lock,'changed lock');expect(()=>assertValidationSourcesUnchanged(frozen,root)).toThrow(/source changed/);
 writeFileSync(lock,'original lock');writeFileSync(join(root,'src/engine/new-module.js'),'new dependency');
 expect(()=>assertValidationSourcesUnchanged(frozen,root)).toThrow(/source changed/);
});
