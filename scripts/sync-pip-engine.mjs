// Vendor a tagged pip-engine release into the site and the maker edge function.
// Usage: node scripts/sync-pip-engine.mjs 0.1.0
// Then deploy the site AND the `maker` function together: the runtime children play on and the
// contract the model writes against must always be the same engine version.
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = (process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+([-.][\w.]+)?$/.test(version)) { console.error('Usage: node scripts/sync-pip-engine.mjs <version>   e.g. 0.1.0'); process.exit(1); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = `https://raw.githubusercontent.com/GreatPyreneseDad/pip-engine/v${version}/dist/`;
const targets = [['pip-engine.js', 'public/pip-engine/pip-engine.js'], ['pip-engine.mjs', 'supabase/functions/maker/pip-engine.mjs']];

for (const [file, dest] of targets) {
  const res = await fetch(base + file);
  if (!res.ok) { console.error(`Could not fetch ${base + file}: HTTP ${res.status}`); process.exit(1); }
  const text = await res.text();
  if (!text.includes(`"${version}"`)) { console.error(`${file} does not declare version ${version}; refusing to write.`); process.exit(1); }
  const out = resolve(root, dest); await mkdir(dirname(out), { recursive: true }); await writeFile(out, text);
  console.log(`${dest}  (${text.length} bytes)`);
}
console.log(`pip-engine ${version} vendored. Deploy the site and the maker function together.`);
