#!/usr/bin/env node
import { analyze, addCustomers } from './core.mjs';

const help = `Plugin Dev 0.1.0 — early prototype
node src/cli.mjs analyze <project>
node src/cli.mjs add customers <project> [--apply] [--theme primary=--brand-primary,radius=--radius]
By default, add only previews changes. No project scripts are executed.`;

try {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help') console.log(help);
  else if (args[0] === 'analyze' && args.length === 2) console.log(JSON.stringify(await analyze(args[1]), null, 2));
  else if (args[0] === 'add' && args[1] === 'customers' && args[2]) {
    const options = { apply: false, theme: {} };
    for (let i = 3; i < args.length; i++) {
      if (args[i] === '--apply') options.apply = true;
      else if (args[i] === '--theme' && args[i + 1]) {
        for (const pair of args[++i].split(',')) {
          const parts = pair.split('=');
          if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('Expected --theme key=--css-variable.');
          options.theme[parts[0]] = parts[1];
        }
      } else throw new Error(`Unknown argument: ${args[i]}`);
    }
    console.log(JSON.stringify(await addCustomers(args[2], options), null, 2));
  } else throw new Error(help);
} catch (error) {
  console.error(`Plugin Dev: ${error.message}`);
  process.exitCode = 1;
}
