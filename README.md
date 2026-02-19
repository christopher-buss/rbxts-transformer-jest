# rbxts-transformer-jest

[![npm version](https://img.shields.io/npm/v/rbxts-transformer-jest)](https://www.npmjs.com/package/rbxts-transformer-jest)
[![CI](https://github.com/christopher-buss/rbxts-jest-transformer/actions/workflows/ci.yaml/badge.svg)](https://github.com/christopher-buss/rbxts-jest-transformer/actions/workflows/ci.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/christopher-buss/rbxts-jest-transformer/blob/main/LICENSE)

TypeScript custom transformer for roblox-ts that hoists `jest.mock()` and
`jest.unmock()` calls above imports at compile time.

## The Problem

Jest requires `jest.mock()` calls to execute **before** the modules they target
are imported. You could manually place mocks above imports, but that's tedious
and easy to forget. Without Babel in the roblox-ts pipeline, there's no built-in
way to automate it.

This transformer reorders statements at the AST level so mocks run before
imports.

## Prerequisites

Requires [`@rbxts/jest`](https://github.com/jsdotlua/jest-lua) and
`@rbxts/jest-globals`.

## Install

```sh
pnpm i -D rbxts-transformer-jest
```

## Setup

Add to your `tsconfig.json`:

```jsonc
{
	"compilerOptions": {
		"plugins": [
			{
				"transform": "rbxts-transformer-jest",
			},
		],
	},
}
```

## Before / After

**Input:**

```ts
import { jest } from "@rbxts/jest-globals";

import { MyService } from "./my-service";

const mockHandler = jest.fn();
jest.mock("./my-service", () => ({ handler: mockHandler }));
```

**Output (reordered at compile time):**

```ts
import { jest } from "@rbxts/jest-globals";

const mockHandler = jest.fn();
jest.mock("./my-service", () => ({ handler: mockHandler }));

import { MyService } from "./my-service";
```

The `@rbxts/jest-globals` import always stays first. Mock-prefix variables
referenced in factories get hoisted alongside the mock call.

## String Require Support

The transformer can resolve package specifiers like `"@rbxts/services"` into
Roblox instance paths at compile time, so you can write:

```ts
jest.mock<typeof import("@rbxts/services")>("@rbxts/services", () => {
	return { Workspace: {} as Workspace };
});
```

This compiles to the equivalent of:

```lua
jest.mock(game:GetService("ReplicatedStorage"):FindFirstChild("rbxts_include"):FindFirstChild("node_modules"):FindFirstChild("@rbxts"):FindFirstChild("services"), function() ... end)
```

> **Note:** You must patch `@rbxts/jest` types to accept a `string` as the first
> argument to `jest.mock()` and `jest.unmock()`. The upstream types only accept
> `ModuleScript` and do not account for string specifiers being transformed at
> compile time.

## License

[MIT](https://github.com/christopher-buss/rbxts-jest-transformer/blob/main/LICENSE)
