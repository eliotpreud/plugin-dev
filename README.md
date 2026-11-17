# Plugin Dev

Reusable, customizable building blocks for SaaS and ERP applications across different industries.

**Status: early working prototype.** The current adapter supports React + TypeScript project detection and generates a customer-management UI. Multi-language integration and automatic code adaptation are roadmap items, not shipped capabilities.

## Why

Different products repeatedly need the same foundations: customer management, forms, permissions, notifications, settings, billing and administration. Plugin Dev aims to make those foundations reusable while keeping each application's business logic, design and technology choices customizable.

The intended workflow is **analyze the existing project → propose an integration → review → apply**. Generated source code belongs to the host project and can be edited directly.

## What works today

- Local CLI with no third-party runtime dependencies and no network requests.
- Detects React from package.json and TypeScript from a root tsconfig.json.
- Scans a bounded set of CSS files for custom properties and suggests theme mappings.
- Previews a customers module before writing anything.
- Generates a typed, controlled React component, scoped CSS and integration notes.
- Reuses detected theme variables with fallbacks; supports explicit mapping overrides.
- Refuses conflicting files and linked output directories. Identical generation is idempotent.
- Includes automated tests and a small analysis fixture.

## Try it

Requires Node.js 22 or newer. Clone this repository; no npm install is needed for the CLI or its tests.

```sh
node src/cli.mjs analyze examples/react-host
node src/cli.mjs add customers examples/react-host
npm test
```

The example is an analysis fixture, not a bootable React application.

For your own React/TypeScript application:

```sh
node src/cli.mjs analyze /path/to/app
node src/cli.mjs add customers /path/to/app
node src/cli.mjs add customers /path/to/app --apply
# Optional: map a semantic role to an existing, detected CSS variable.
node src/cli.mjs add customers /path/to/app --theme primary=--brand-primary --apply
```

Generated files go to `src/plugins/customers/`. Review the preview first, commit or back up your host application, and use a normal single-writer development directory.

Import and mount the component yourself:

```tsx
import { Customers } from './plugins/customers/Customers';

// The host supplies state and persistence. createCustomer must update that state
// on success and reject on failure.
<Customers customers={customers} onCreate={createCustomer} />
```

For Next.js App Router, mount it from a client component. The generated module does not install packages or change routes, layouts, authentication, APIs or database schemas.

## Limits to understand

CSS detection uses a heuristic rather than a CSS or source-code AST. It cannot prove variable scope, infer all design-system semantics, or adapt arbitrary existing components. Color values must be complete CSS colors; channel-only HSL values need a manual override. Verify contrast and accessibility in your host theme.

The customers module is a UI building block, not a complete CRM or secure backend. The host must implement server-side validation, authorization, tenant isolation, persistence and error handling. The scanner does not execute project code or read .env files. It skips hidden directories, common dependency/build directories and symbolic links; only package.json, the presence of tsconfig.json and bounded CSS files are inspected. Do not run it against a directory being modified by an untrusted process. Writes are not transactional across multiple files; an I/O failure can leave a partial generation.

## Architecture and next steps

See [the project analysis](docs/PROJECT_ANALYSIS.md), [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md) and [contribution guide](CONTRIBUTING.md).

## Maintainer background

Maintainer statement: I have already developed a substantial amount of related code, both as open-source work and in private projects. If my Claude for Open Source application is accepted, I could make additional eligible private components public after checking ownership, third-party licenses, and removing secrets and client-specific data. Those earlier components are not included in this fresh prototype; no adoption or contribution metrics for them are claimed here.

## License

MIT — see [LICENSE](LICENSE).
