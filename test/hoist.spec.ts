import { describe, expect, it } from "vitest";

import { compile } from "./compile.js";

describe("integration: hoist-jest through roblox-ts pipeline", () => {
	it("should hoist jest.mock above require in Lua output", () => {
		expect.assertions(1);

		const source = `
			import { jest } from "@rbxts/jest-globals";
			import { foo } from "./foo";
			jest.mock("./foo" as unknown as ModuleScript);
			print(foo);
		`;

		const luau = compile(source);

		expect(luau).toMatchSnapshot();
	});

	it("should keep jest-globals import as first statement", () => {
		expect.assertions(2);

		const source = `
			import { jest } from "@rbxts/jest-globals";
			import { foo } from "./foo";
			jest.mock("./foo" as unknown as ModuleScript);
			print(foo);
		`;

		const luau = compile(source);
		const importLines = luau.split("\n").filter((line) => line.includes("TS.import"));

		expect(importLines).not.toHaveLength(0);
		expect(importLines[0]).toContain("jest-globals");
	});

	it("should compile aliased jest import correctly", () => {
		expect.assertions(1);

		const source = `
			import { jest as j } from "@rbxts/jest-globals";
			import { foo } from "./foo";
			j.mock("./foo" as unknown as ModuleScript);
			print(foo);
		`;

		const luau = compile(source);

		expect(luau).toMatchSnapshot();
	});

	it("should compile namespace import correctly", () => {
		expect.assertions(1);

		const source = `
			import * as JG from "@rbxts/jest-globals";
			import { foo } from "./foo";
			JG.jest.mock("./foo" as unknown as ModuleScript);
			print(foo);
		`;

		const luau = compile(source);

		expect(luau).toMatchSnapshot();
	});

	it("should pass through unchanged when no jest calls", () => {
		expect.assertions(1);

		const source = `
			import { foo } from "./foo";
			const _x = foo;
		`;

		const luau = compile(source);

		expect(luau).toMatchSnapshot();
	});

	it("should preserve order of multiple mocks and un-mocks", () => {
		expect.assertions(1);

		const source = `
			import { jest } from "@rbxts/jest-globals";
			import { a } from "./a";
			import { b } from "./b";
			jest.mock("./a" as unknown as ModuleScript);
			jest.unmock("./b" as unknown as ModuleScript);
			jest.mock("./b" as unknown as ModuleScript);
			print(a, b);
		`;

		const luau = compile(source);

		expect(luau).toMatchSnapshot();
	});
});
