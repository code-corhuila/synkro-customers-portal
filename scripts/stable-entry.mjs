import {readdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export function stableEntry(files) {
  const entries=files.filter(name=>/^main-[\w-]+\.js$/.test(name));
  if (entries.length !== 1) throw new Error('Expected exactly one hashed Angular main');
  return `import ${JSON.stringify('./'+entries[0])};\n`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory=resolve('dist/customers/browser');
  await writeFile(resolve(directory,'remoteEntry.js'),stableEntry(await readdir(directory)));
}
