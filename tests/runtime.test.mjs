import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const runtime = join(root, 'runtime');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else if (entry.isFile()) files.push(relative(runtime, path).split(sep).join('/'));
    else throw new Error(`Unexpected runtime entry: ${path}`);
  }
  return files;
}

test('runtime mirror matches its pinned source manifest and dependencies', async () => {
  const manifest = await readJson(join(runtime, 'source.json'));
  const sourcePackage = await readJson(join(runtime, 'package.json'));
  const wrapperPackage = await readJson(join(root, 'package.json'));
  assert.equal(manifest.repository, 'https://github.com/vb2250158/tencent-docs-web-proxy');
  assert.equal(manifest.commit, '94659228088fea30b4c2fbca47751763fdff4110');
  assert.equal(manifest.version, sourcePackage.version);
  const actual = (await filesIn(runtime)).filter(name => name !== 'source.json').sort();
  assert.deepEqual(actual, Object.keys(manifest.files).sort());
  for (const name of actual) {
    assert.match(manifest.files[name], /^[a-f0-9]{64}$/);
    const bytes = await readFile(join(runtime, ...name.split('/')));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files[name], name);
  }
  for (const [name, version] of Object.entries(sourcePackage.dependencies)) {
    assert.equal(wrapperPackage.dependencies?.[name], version, `dependency ${name}`);
  }
  assert(wrapperPackage.files.includes('runtime'));
});
