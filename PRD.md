# PRD: rbxts-jest-transformer

**Author:** Christopher Buss **Date:** 2026-02-12 **Status:** Draft **Taskmaster
Optimized:** Yes

---

## Problem & Solution

### Problem

roblox-ts projects using `@rbxts/jest` cannot use `jest.mock()` because
roblox-ts compiles imports before mock registration runs. Jest requires mock
calls to execute before the modules they target are imported — but TypeScript
(and by extension roblox-ts) hoists `import` statements to the top of the file
per spec.

### Proposed Solution

A TypeScript custom transformer that reorders AST statements to hoist
`jest.mock()` (and related calls) above imports at compile time, while keeping
the `@rbxts/jest-globals` import first. Purely syntactic — no type information
needed.

### Success Metric

All hoistable jest methods correctly reordered in roblox-ts compilation
pipeline, validated by unit tests with 100% coverage and integration tests
through the full roblox-ts VirtualProject pipeline (TS → Lua).

---

## Requirements

### Must Have

1. **[REQ-001]** ✅: Hoist jest `mock` and `unmock` above imports
    - Methods: `mock`, `unmock`
    - `deepUnmock`, `enableAutomock`, `disableAutomock` not implemented in
      `@rbxts/jest` — omitted
    - Acceptance: `jest.mock("./foo")` placed after imports → appears before
      imports in output

2. **[REQ-002]** ✅: Keep `@rbxts/jest-globals` import as first statement
    - roblox-ts-specific: `@rbxts/jest-globals` must execute before hoisted
      calls so `jest`/`expect` are available
    - Acceptance: Output order is always `@rbxts/jest-globals` import → hoisted
      calls → other imports → rest

3. **[REQ-003]** ✅: Detect jest calls via import tracking
    - Support named (`import { jest }`), aliased (`import { jest as j }`), and
      namespace (`import * as JG`) imports from `@rbxts/jest-globals`
    - roblox-ts has no global jest — only tracked import bindings are recognized
    - Acceptance: All 3 import styles correctly detected

4. **[REQ-004]**: Ignore non-jest objects and shadowed bindings
    - `other.mock("./foo")` must not hoist
    - `const jest = {...}; jest.mock()` must not hoist
    - Requires scope stack to detect shadowing (no Babel scope API available)
    - Acceptance: Non-jest and shadowed calls remain in original position

5. **[REQ-005]**: Validate factory function purity
    - `jest.mock("./foo", () => ...)` factory must only reference allowed
      identifiers, `mock`-prefixed vars, or `jest`/`expect`
    - Invalid factories throw a compile error (match Babel behavior)
    - Acceptance: Invalid factory refs throw, valid ones hoist

6. **[REQ-006]**: Hoist mock-prefixed variables
    - Variables matching `/^mock/i` referenced in factories hoist alongside the
      `jest.mock` call
    - Acceptance: `const mockFoo = jest.fn(); jest.mock("./foo", () => mockFoo)`
      → both hoist above imports

7. **[REQ-007]**: Block scope hoisting — hoist within function/block bodies, not
   just top-level (matches Babel behavior which hoists in every BlockStatement)

8. **[REQ-008]**: Chained call support — `jest.unmock('./a').unmock('./b')`
   treated as single hoistable statement (recursive jest object extraction)

### Should Have

9. **[REQ-009]**: Pure constant hoisting —
   `const X = 42; jest.mock('./foo', () => X)` hoists `X` too
10. **[REQ-010]**: Polyfill-aware allowlist — allow roblox-ts polyfill globals
    (`Array`, `Map`, `Set`, `Object`, etc.) in factories since their imports
    wouldn't be mocked and would remain above hoisted calls

### Nice to Have

11. **[REQ-011]**: Configurable jest module specifier — allow overriding the
    `@rbxts/jest-globals` module name via plugin config for non-standard setups

---

## Technical Notes

**Architecture:** Single `ts.TransformerFactory<ts.SourceFile>` export.
Two-phase approach:

1. **Scan** — walk top-level statements to track `@rbxts/jest-globals` imports
   and collect jest identifier names
2. **Reorder** — partition statements into buckets and reassemble in correct
   order

**Transform pipeline:**

```text
SourceFile statements
  → partition into: jestImport | hoistedVars | hoistedCalls | other
  → reassemble: [jestImport, ...hoistedVars, ...hoistedCalls, ...other]
```

**Statement classification:**

```typescript
// Hoistable if:
// 1. ExpressionStatement with CallExpression
// 2. Callee is PropertyAccessExpression on tracked jest identifier
// 3. Property name is `mock` or `unmock`
// 4. If factory arg exists, passes purity validation
```

**Factory validation (minimal allowlist for roblox-ts):**

```typescript
const ALLOWED_IDENTIFIERS = new Set([
	"expect",
	"Infinity",
	"jest",
	"NaN",
	"undefined",
]);
// + /^mock/i test for variable names
// + /^(?:__)?cov/ for istanbul coverage vars
```

Note: Babel's allowlist includes ~40 JS/Node globals (`Array`, `Object`, `Map`,
`Math`, `JSON`, etc.) but most don't exist as true globals in roblox-ts — they
come from imported polyfill libraries. A polyfill-aware allowlist (REQ-010) may
expand this in the future since polyfill imports wouldn't be mocked and would
remain above hoisted calls.

**Scope stack for shadowing detection:**

Without Babel's scope/binding API, we implement a lightweight scope stack:

- Push scope on entering Block/Function/SourceFile
- Track variable declarations (`const`, `let`, `var`, function params, catch
  bindings)
- Check if `jest` identifier has a binding in any enclosing scope
- If bound → shadowed → don't hoist

**Error format:**

Invalid factory references throw a `ReferenceError` with message matching
Babel's format:

```text
The module factory of `jest.mock()` is not allowed to reference any
out-of-scope variables.
Invalid variable access: <name>
Allowed objects: <list>.
Note: This is a precaution to guard against uninitialized mock variables.
If it is ensured that the mock is required lazily, variable names prefixed
with `mock` (case insensitive) are permitted.
```

**Dependencies:**

- `typescript` (peer — AST APIs)
- No roblox-ts dependency for the transformer itself

---

## Implementation

**Phase 1 — Core hoisting:**

- Implement jest import tracking (`@rbxts/jest-globals` detection, all 3 import
  styles)
- Implement hoistable call detection (`mock`, `unmock`)
- Implement top-level statement reordering
- Implement shadowed binding detection (scope stack)
- Update snapshot tests

**Phase 2 — Validation & variables:**

- Port factory purity validation from babel (minimal allowlist)
- Implement mock-prefixed variable hoisting (`/^mock/i`)
- Throw on invalid factory references
- Add block scope hoisting

**Phase 3 — Edge cases:**

- Chained call support (recursive jest object extraction)
- Pure constant hoisting
- Polyfill-aware allowlist expansion

---

## Out of Scope

- Babel AST / babel plugin compatibility
- `_getJestObj()` getter pattern (roblox-ts has no dynamic require)
- ~~Integration test tier (Tier 2 with patched roblox-ts VirtualProject)~~ —
  implemented via `test/compile.ts` + `test/hoist.spec.ts`
- `jest.requireActual` / `jest.requireMock` support
- JSX/TSX-specific handling

---

## Resolved Questions

1. **Invalid factories** → throw compile error (match Babel)
2. **Scope detection** → lightweight scope stack (track bindings per
   block/function)
3. **Block hoisting** → promoted to must-have (REQ-007), matches Babel behavior
4. **Allowlist** → minimal for P0 (`jest`, `expect`, `undefined`, `NaN`,
   `Infinity`), polyfill expansion as nice-to-have

## Open Questions

1. Do we need `jest.createMockFromModule` in the hoistable set?
2. Should we support `require()` calls inside factories given roblox-ts
   limitations?

---

**Task Breakdown for Taskmaster:**

1. Jest import tracking (named, aliased, namespace) — Depends on: none
2. Hoistable call detection (`mock`, `unmock`) — Depends on: Task 1
3. Top-level statement reordering — Depends on: Task 2
4. Shadowed binding detection (scope stack) — Depends on: Task 1
5. Factory purity validation (minimal allowlist, throw on invalid) — Depends on:
   Task 2
6. Mock-prefixed variable hoisting — Depends on: Task 5
7. Block scope hoisting — Depends on: Task 3
8. Chained call support — Depends on: Task 2
9. Update tests + snapshots — Depends on: Tasks 3, 4, 5, 6, 7
10. Pure constant hoisting — Depends on: Task 5
11. Polyfill-aware allowlist — Depends on: Task 5

**Critical Path:** Task 1 → Task 2 → Task 3 → Task 7
