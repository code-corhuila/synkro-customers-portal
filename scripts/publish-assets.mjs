// Publish bundles first, then atomically switch the entry. Never prune old assets.
import {cpSync,mkdirSync,readdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const source=resolve(process.argv[2] || 'dist/customers/browser');
const destination=process.argv[3];
if(!destination)throw Error('Provide the persistent served-assets directory');
const target=resolve(destination);if(source===target)throw Error('Build and served directories must differ');
mkdirSync(target,{recursive:true});
for(const entry of readdirSync(source))if(entry!=='remoteEntry.js')cpSync(join(source,entry),join(target,entry),{recursive:true});
const pending=join(target,'.entry-'+randomUUID());
cpSync(join(source,'remoteEntry.js'),pending);renameSync(pending,join(target,'remoteEntry.js'));
console.log('Entry published; existing assets retained');
