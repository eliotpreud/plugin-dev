import { readdir, readFile, lstat, realpath, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const excluded = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'vendor', '.next', '.nuxt', 'public', 'uploads']);
const cssName = /^--[a-zA-Z_][a-zA-Z0-9_-]*$/;
const maxBytes = 256 * 1024;

async function checkDestination(root, parts) {
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe output directory: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Missing descendants cannot exist until this directory is created.
      break;
    }
  }
}

async function regularFile(file) {
  try {
    const stat = await lstat(file);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size <= maxBytes;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function analyze(project) {
  const root = await realpath(path.resolve(project));
  if (!(await lstat(root)).isDirectory()) throw new Error('Project must be a directory.');
  if (!(await regularFile(path.join(root, 'package.json')))) throw new Error('A regular package.json is required (maximum 256 KiB).');
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const dependencies = { ...manifest.devDependencies, ...manifest.dependencies };
  const tokens = new Set();
  const cssFiles = [];
  let scannedEntries = 0;
  let limited = false;
  async function walk(dir, depth = 0) {
    if (depth > 6) { limited = true; return; }
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++scannedEntries > 2000) { limited = true; return; }
      if (entry.name.startsWith('.') || excluded.has(entry.name) || entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.css') && await regularFile(file)) {
        if (cssFiles.length >= 50) { limited = true; continue; }
        const css = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
        cssFiles.push(path.relative(root, file));
        for (const match of css.matchAll(/(--[a-zA-Z_][a-zA-Z0-9_-]*)\s*:/g)) tokens.add(match[1]);
      }
      if (scannedEntries > 2000) return;
    }
  }
  await walk(root);
  const supported = Boolean(dependencies.react) && await regularFile(path.join(root, 'tsconfig.json'));
  const tokenList = [...tokens].sort();
  const pick = (names) => names.find(name => tokens.has(name)) ?? null;
  return {
    root, adapter: supported ? 'react-typescript' : null,
    cssFiles, tokens: tokenList,
    suggestedTheme: {
      primary: pick(['--brand-primary', '--color-primary', '--primary']),
      background: pick(['--color-background', '--background']),
      foreground: pick(['--color-foreground', '--foreground']),
      radius: pick(['--radius', '--border-radius']),
    },
    warnings: [
      ...(!supported ? ['Only React projects with a root tsconfig.json are supported by this prototype.'] : []),
      ...(limited ? ['Scan limit reached; results are incomplete.'] : []),
      'CSS detection is heuristic: token scope and value format require review. HSL channel-only tokens need a manual CSS override.',
      'Existing routes, authentication, persistence and application layouts are not modified.',
    ],
  };
}

const themeKeys = new Set(['primary', 'background', 'foreground', 'radius']);

export function renderCustomers(theme) {
  const defaults = { primary: '#2563eb', background: '#fff', foreground: '#172033', radius: '0.75rem' };
  const value = key => theme[key] ? `var(${theme[key]}, ${defaults[key]})` : defaults[key];
  return {
    'Customers.tsx': `import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import './customers.css';

export type Customer = { id: string; name: string; email: string };
export type CustomersProps = {
  customers: Customer[];
  onCreate: (input: Omit<Customer, 'id'>) => Promise<void>;
  title?: string;
};

/** Controlled UI: the host owns authorization, persistence and tenant isolation. */
export function Customers({ customers, onCreate, title = 'Customers' }: CustomersProps) {
  const formId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    if (!name || !email) { setError('Name and email are required.'); return; }
    setPending(true);
    setError('');
    try { await onCreate({ name, email }); form.reset(); }
    catch { setError('Could not save the customer. Please try again.'); }
    finally { setPending(false); }
  }
  return (
    <section className="pd-customers" aria-labelledby={formId + '-title'}>
      <h2 id={formId + '-title'}>{title}</h2>
      <form onSubmit={submit} aria-busy={pending}>
        <label htmlFor={formId + '-name'}>Name</label>
        <input id={formId + '-name'} name="name" required maxLength={120} disabled={pending} />
        <label htmlFor={formId + '-email'}>Email</label>
        <input id={formId + '-email'} name="email" type="email" required maxLength={254} disabled={pending} />
        <button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Add customer'}</button>
        <p role="status">{error}</p>
      </form>
      {customers.length === 0 ? <p>No customers yet.</p> : (
        <ul aria-label="Customer list">{customers.map(customer => (
          <li key={customer.id}><strong>{customer.name}</strong> <span>{customer.email}</span></li>
        ))}</ul>
      )}
    </section>
  );
}
`,
    'customers.css': `.pd-customers {
  --pd-primary: ${value('primary')};
  --pd-background: ${value('background')};
  --pd-foreground: ${value('foreground')};
  --pd-radius: ${value('radius')};
  color: var(--pd-foreground);
  background: var(--pd-background);
  border: 1px solid currentColor;
  border-radius: var(--pd-radius);
  padding: 1.5rem;
  font: inherit;
}
.pd-customers form { display: grid; gap: 0.65rem; }
.pd-customers input, .pd-customers button {
  font: inherit; padding: 0.6rem; border-radius: var(--pd-radius);
}
.pd-customers input { color: inherit; background: inherit; border: 1px solid currentColor; }
.pd-customers button { background: var(--pd-primary); color: var(--pd-background); border: 1px solid currentColor; cursor: pointer; }
.pd-customers button:disabled { opacity: 0.6; cursor: wait; }
.pd-customers :focus-visible { outline: 3px solid var(--pd-primary); outline-offset: 3px; }
.pd-customers ul { padding-inline-start: 1.5rem; }
.pd-customers li { margin-block: 0.75rem; overflow-wrap: anywhere; }
`,
    'INTEGRATION.md': `# Customers module\n\nGenerated by Plugin Dev 0.1.0. Review before integrating.\n\nImport { Customers } from './plugins/customers/Customers' from a component in src/.\nIn Next.js App Router, import it from a client component with a 'use client' directive.\nPass customers and an asynchronous onCreate callback from your host application.\nThe callback must reject on failure and update the host list on success.\n\nThe host is responsible for API authentication, server-side validation, permissions,\ntenant isolation, persistence and deduplication. This module is a UI prototype.\nNo route, database table or authentication is created.\n\nLoad your host theme stylesheet. Verify token scope, color format, contrast, and layout.\nOverride --pd-* within .pd-customers to customize. Files belong to you after generation;\nthere is no automatic update or merge of customized code.\n`,
  };
}

export async function addCustomers(project, { apply = false, theme: overrides = {} } = {}) {
  const report = await analyze(project);
  if (!report.adapter) throw new Error(report.warnings[0]);
  for (const [key, token] of Object.entries(overrides)) {
    if (!themeKeys.has(key) || !cssName.test(token) || !report.tokens.includes(token)) {
      throw new Error(`Invalid theme mapping: ${key}=${token}. Use a detected CSS variable.`);
    }
  }
  const theme = { ...report.suggestedTheme, ...overrides };
  const parts = ['src', 'plugins', 'customers'];
  await checkDestination(report.root, parts);
  const directory = path.join(report.root, ...parts);
  const files = renderCustomers(theme);
  const operations = [];
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(directory, name);
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe file: ${file}`);
      if (stat.size > maxBytes || await readFile(file, 'utf8') !== content) throw new Error(`Conflict: ${file}. Existing files are never overwritten.`);
      operations.push({ path: path.relative(report.root, file), action: 'unchanged' });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      operations.push({ path: path.relative(report.root, file), action: 'create' });
    }
  }
  if (apply) {
    await mkdir(directory, { recursive: true });
    for (const op of operations.filter(op => op.action === 'create')) {
      await writeFile(path.join(report.root, op.path), files[path.basename(op.path)], { flag: 'wx' });
    }
  }
  return { ...report, mode: apply ? 'applied' : 'preview', theme, operations };
}
