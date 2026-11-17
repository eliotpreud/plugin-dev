import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyze, addCustomers } from '../src/core.mjs';

async function host(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'plugin-dev-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { react: '^19' } }));
  await writeFile(path.join(root, 'tsconfig.json'), '{}');
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src/theme.css'), ':root { --brand-primary: #abc; --radius: 1rem; }');
  return root;
}

test('detects host stack and tokens, ignores comments, hidden files and dependencies', async t => {
  const root = await host(t);
  await mkdir(path.join(root, 'node_modules'));
  await writeFile(path.join(root, 'node_modules/ignored.css'), ':root { --secret: red; }');
  await writeFile(path.join(root, '.hidden.css'), ':root { --hidden: red; }');
  await writeFile(path.join(root, 'src/comment.css'), '/* --fake: red; */');
  const report = await analyze(root);
  assert.equal(report.adapter, 'react-typescript');
  assert.deepEqual(report.tokens, ['--brand-primary', '--radius']);
});

test('preview writes nothing; apply uses host tokens and is idempotent', async t => {
  const root = await host(t);
  const before = await readdir(path.join(root, 'src'));
  const preview = await addCustomers(root);
  assert.equal(preview.mode, 'preview');
  assert.equal(preview.operations.length, 3);
  assert.deepEqual(await readdir(path.join(root, 'src')), before);
  await addCustomers(root, { apply: true });
  const css = await readFile(path.join(root, 'src/plugins/customers/customers.css'), 'utf8');
  assert.match(css, /var\(--brand-primary, #2563eb\)/);
  assert.match(css, /var\(--radius, 0.75rem\)/);
  const repeat = await addCustomers(root, { apply: true });
  assert.ok(repeat.operations.every(op => op.action === 'unchanged'));
});

test('conflicts abort before other files are created', async t => {
  const root = await host(t);
  const directory = path.join(root, 'src/plugins/customers');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'customers.css'), 'custom work');
  await assert.rejects(addCustomers(root, { apply: true }), /Conflict/);
  assert.deepEqual(await readdir(directory), ['customers.css']);
  assert.equal(await readFile(path.join(directory, 'customers.css'), 'utf8'), 'custom work');
});

test('unsupported stack is rejected without writes', async t => {
  const root = await host(t);
  await writeFile(path.join(root, 'package.json'), '{}');
  await assert.rejects(addCustomers(root, { apply: true }), /Only React/);
  assert.deepEqual(await readdir(path.join(root, 'src')), ['theme.css']);
});

test('validates explicit token mappings and rejects CSS injection', async t => {
  const root = await host(t);
  const plan = await addCustomers(root, { theme: { foreground: '--brand-primary' } });
  assert.equal(plan.theme.foreground, '--brand-primary');
  await assert.rejects(addCustomers(root, { theme: { primary: '--missing' } }), /Invalid theme/);
  await assert.rejects(addCustomers(root, { theme: { primary: '--x); } body {' } }), /Invalid theme/);
});

test('does not traverse linked styles or write through a linked output directory', async t => {
  const root = await host(t);
  const outside = await mkdtemp(path.join(tmpdir(), 'plugin-dev-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, 'outside.css'), ':root { --outside: red; }');
  await symlink(outside, path.join(root, 'linked'));
  assert.ok(!(await analyze(root)).tokens.includes('--outside'));
  await symlink(outside, path.join(root, 'src/plugins'));
  await assert.rejects(addCustomers(root, { apply: true }), /Unsafe output/);
  assert.deepEqual(await readdir(outside), ['outside.css']);
});

test('CLI previews successfully and rejects unknown options', async t => {
  const root = await host(t);
  const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [cli, 'add', 'customers', root], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).mode, 'preview');
  const invalid = spawnSync(process.execPath, [cli, 'add', 'customers', root, '--force'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown argument/);
});
