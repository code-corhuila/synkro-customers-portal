import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('publishing keeps the previous hashed bundle for already open tabs',()=>{
  const owned=mkdtempSync(join(tmpdir(),'customers-assets-'));
  try {
    const source=join(owned,'build'),target=join(owned,'served');mkdirSync(source);mkdirSync(target);
    writeFileSync(join(target,'main-OLDHASH.js'),'old');writeFileSync(join(source,'main-NEWHASH.js'),'new');writeFileSync(join(source,'remoteEntry.js'),'import "./main-NEWHASH.js";');
    const result=spawnSync(process.execPath,['scripts/publish-assets.mjs',source,target],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);assert(existsSync(join(target,'main-OLDHASH.js')));
    assert.equal(readFileSync(join(target,'main-NEWHASH.js'),'utf8'),'new');assert.equal(readFileSync(join(target,'remoteEntry.js'),'utf8'),'import "./main-NEWHASH.js";');
  } finally {rmSync(owned,{recursive:true,force:true});}
});
