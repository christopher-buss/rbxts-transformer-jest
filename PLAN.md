# rbxts-transformer-jest

A roblox-ts TypeScript transformer that hoists `jest.mock()` and related calls
above import statements, enabling proper mock behavior in Jest-Roblox tests.

## Problem

Jest's mock system requires mocks to be registered _before_ the mocked modules
are imported. In standard Jest, `babel-plugin-jest-hoist` rewrites the AST to
move mock calls above imports. roblox-ts can't use Babel or ts-jest, so we need
an equivalent transformer that works within the roblox-ts compiler pipeline.

Without hoisting, users must manually structure their test files to call mocks
before imports — awkward and error-prone.

## Solution

A TypeScript transformer (compatible with roblox-ts's `tsconfig.json` `plugins`
field) that reorders statements at compile time.

### Hoisted Calls

Following the same pattern as ts-jest and babel-plugin-jest-hoist, these
`jest.*` methods are hoisted:

- `jest.mock()`
- `jest.unmock()`
- `jest.enableAutomock()`
- `jest.disableAutomock()`
- `jest.deepUnmock()`

### Statement Ordering

The transformer reorders top-level statements into this priority:

1. Imports from `@rbxts/jest-globals` (jest must be available first)
2. Hoistable `jest.*` calls (mock registrations)
3. All other statements (unchanged order)

### Example

**Input:**

```ts
import { describe, expect, it } from "@rbxts/jest-globals";

import { MyService } from "./my-service";

jest.mock("./my-service");

describe("consumer", () => {
	it("uses mocked service", () => {
		expect(MyService).toBeDefined();
	});
});
```

**Output (reordered):**

```ts
jest.mock("./my-service");

import { describe, expect, it } from "@rbxts/jest-globals";

import { MyService } from "./my-service";

describe("consumer", () => {
	it("uses mocked service", () => {
		expect(MyService).toBeDefined();
	});
});
```

### Mock-Prefixed Variable Escape Hatch

Jest convention: variables prefixed with `mock` can be referenced inside
`jest.mock()` factory functions, even though the factory is hoisted. The
transformer should recognize this pattern and hoist the `mock`-prefixed variable
declarations alongside the mock call.

```ts
const [mockFunc] = jest.fn(() => 42);
jest.mock("./service", () => ({ getValue: mockFunc }));
```

Both the `mockFn` declaration and `jest.mock()` call should be hoisted together.

## Integration with roblox-ts

roblox-ts supports TypeScript transformers via `tsconfig.json`:

```json
{
	"compilerOptions": {
		"plugins": [
			{
				"transform": "rbxts-transformer-jest"
			}
		]
	}
}
```

The transformer runs during the roblox-ts compilation step — no additional build
tooling required.

## References

| Resource                                                                                                | Description                                              |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [babel-plugin-jest-hoist](https://github.com/jestjs/jest/tree/main/packages/babel-plugin-jest-hoist)    | Original Babel implementation in Jest monorepo           |
| [ts-jest hoist-jest.ts](https://github.com/kulshekhar/ts-jest/blob/main/src/transformers/hoist-jest.ts) | TypeScript transformer equivalent in ts-jest             |
| [ts-jest](https://github.com/kulshekhar/ts-jest)                                                        | Full Jest+TypeScript integration (transformer reference) |

## Future Enhancements

### Source Map Support

Map errors and stack traces from compiled Luau back to original `.ts` line
numbers. Improves test failure output in jest-roblox-cli by pointing to the
actual TypeScript source rather than transpiled Lua.

### Diagnostics Integration

Run type-checking during the transform phase, surfacing TypeScript errors as
test failures. Catches type errors without a separate `tsc` step — useful for CI
pipelines that only run tests.
