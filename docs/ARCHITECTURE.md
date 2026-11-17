# Architecture

`src/cli.mjs` parses a small explicit command surface. `src/core.mjs` implements local analysis, theme mapping, customer-module rendering, preflight conflict checks and opt-in writes. `test/core.test.mjs` exercises temporary host projects. The implementation uses Node built-ins only.

## Current pipeline

1. Resolve the host directory and inspect package.json and root tsconfig.json.
2. Walk at most 2,000 directory entries and inspect at most 50 CSS files of at most 256 KiB each, no deeper than six nested directory levels.
3. Extract CSS property declarations, suggest semantic mappings and emit warnings.
4. Render a controlled React customer module, CSS and integration notes.
5. Check every destination before writing. Existing identical files are unchanged; conflicting files fail.
6. With --apply, create missing files exclusively. The host mounts the module and supplies persistence.

No host scripts execute. No secrets are uploaded. CSS token names are reported locally; no source is sent to any AI provider.

## Planned adapter contract

An adapter should define detection evidence, supported host versions, integration requirements, feature capabilities, style mappings, output files and validation steps. Separate frontend, backend and persistence capabilities rather than implying all stacks support every module.

## Safety boundaries

Symbolic links are excluded from scanning and destination paths. The tool is intended for a trusted development directory, not concurrent hostile filesystem mutation. Multiple writes are not a transaction. Configuration or dependency changes need their own preview format before they can be automated.

## Future adaptation

Add AST-based imports and routing integration with explicit conflict detection, then user-reviewed patches. Optional AI-assisted suggestions should be opt-in with an explanation of exactly which source files would leave the device. No such feature exists today.
