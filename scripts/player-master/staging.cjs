'use strict';
const fs=require('node:fs');
const path=require('node:path');
function resolveStagingOutput(args, root) {
  if (args.includes('--dry-run')||args.includes('--debug')) return null;
  const arg=args.find(a=>a.startsWith('--output='));
  if (!arg || !arg.slice(9)) throw new Error('Explicit --output=<new-staging-file> required; direct source generation is disabled');
  const output=path.resolve(root,arg.slice(9));
  const parent=fs.realpathSync(path.dirname(output));
  const actual=path.join(parent,path.basename(output));
  for(const directory of ['src','.git']) {
    const protectedPath=path.resolve(root,directory);
    if(actual===protectedPath||actual.startsWith(protectedPath+path.sep)) throw new Error('Cannot write staging output into source or git directories');
  }
  if(fs.existsSync(actual)) throw new Error('Staging output already exists');
  return actual;
}
function writeStagedFile(filename, content) { fs.writeFileSync(filename,content,{encoding:'utf8',flag:'wx'}); }
module.exports={resolveStagingOutput,writeStagedFile};
