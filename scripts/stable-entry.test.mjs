import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stableEntry} from './stable-entry.mjs';
test('CLI-UI-16 stable ESM entry imports the real hashed Angular main relative to itself',()=>{
  assert.equal(stableEntry(['main-AB123456.js','chunk-ZZ123456.js','index.html']), 'import "./main-AB123456.js";\n');
});
test('refuses incomplete or ambiguous outputs rather than publishing a placeholder',()=>{
  assert.throws(()=>stableEntry(['index.html']));
  assert.throws(()=>stableEntry(['main-ONE.js','main-TWO.js']));
});
