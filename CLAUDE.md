# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What This Is

TypeScript custom transformer for roblox-ts that hoists `jest.mock()` and
`jest.unmock()` calls above import statements at compile time. Needed because
roblox-ts compiles imports before mock registration runs, and there's no Babel
in the roblox-ts pipeline. The transformer is purely syntactic (AST statement
reordering, no type information).

## Commands

```sh
pnpm test              # unit tests (src/**/*.spec.ts)
pnpm test:watch        # unit tests in watch mode
pnpm test:coverage     # unit tests with 100% coverage thresholds
pnpm test:integration  # integration tests (test/**/*.spec.ts)
pnpm test:all          # both tiers
pnpm build             # build with tsdown → dist/index.mjs
pnpm lint              # eslint with cache
pnpm typecheck         # tsgo --noEmit (native TS compiler)
```

Run a single test by name: `pnpm test -- -t "should hoist jest.mock"`

## Architecture

**`src/index.ts`** — Single export: `transformer()` returning
`ts.TransformerFactory<ts.SourceFile>`. Two-phase approach:

1. Scan top-level statements to find `@rbxts/jest-globals` imports and track
   jest identifier names
2. Partition statements into buckets and reassemble:
   `[jestGlobalsImport, ...hoistedCalls, ...everything else]`

**`src/test-helpers/transform.ts`** — `transformCode(input)` helper that runs
`ts.createSourceFile` → `ts.transform` → `ts.createPrinter` directly. No
roblox-ts dependency — tests are pure TypeScript AST.

**`src/hoist.spec.ts`** — Snapshot-based unit tests. Update snapshots with
`pnpm test -- -u`.

## Key Constraints

- `@rbxts/jest-globals` import must always remain as the first statement
  (roblox-ts-specific)
- Only `mock` and `unmock` are hoistable — `deepUnmock`, `enableAutomock`,
  `disableAutomock` are not implemented in `@rbxts/jest`
- Transformer takes no `ts.Program` parameter (syntactic-only, no type info)
- ESM-only, Node 24+, erasable syntax only
- 100% test coverage enforced (branches, functions, lines, statements)

## Pre-commit Hooks

`lint-staged` runs eslint --fix and `tsgo --noEmit` on staged files.

## Reference Implementations

- `reference/babel-plugin-jest-hoist/` — Babel's original jest hoist plugin
  (factory validation, mock-prefix variable hoisting)
- `reference/ts-jest-main/src/transformers/hoist-jest.ts` — ts-jest's TypeScript
  AST approach (closest to our implementation pattern)

## Requirements

See `PRD.md` for full spec. Key REQs: REQ-001 (basic hoisting), REQ-002
(jest-globals first), REQ-003 (import tracking), REQ-004 (shadowing), REQ-005
(factory validation), REQ-006 (mock-prefix vars), REQ-007 (block scope), REQ-008
(chained calls).
