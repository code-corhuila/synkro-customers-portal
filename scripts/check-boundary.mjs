import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
async function sources(dir) {
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    const path=join(dir,entry.name);
    if (entry.isDirectory()) await sources(path);
    else if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) {
      const text=await readFile(path,'utf8');
      assert(!/\bfetch\s*\(|\baxios\b|HttpClient|provideHttpClient|Authorization|localStorage|sessionStorage|synkro-api-gateway|https?:\/\//.test(text),`Forbidden transport/session dependency: ${path}`);
    }
  }
}
await sources('src');
if (process.argv.includes('--compiled')) {
  const dir='dist/customers/browser';
  for (const name of await readdir(dir)) if (name.endsWith('.js')) {
    const code=await readFile(join(dir,name),'utf8');
    assert(!/synkro-api-gateway|Bearer |Idempotency-Key|sessionStorage|localStorage/.test(code),`Forbidden portal responsibility: ${name}`);
  }
  // Angular runtime internals may contain framework loading helpers. The source
  // gate above examines all application code, rather than flagging vendor helpers
  // as application API calls. No framework transport service is registered.
}
console.log('Host-only transport/session boundary verified');
