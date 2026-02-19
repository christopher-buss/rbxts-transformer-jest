import ts from "typescript";
import { describe, expect, it } from "vitest";

import type { PackageResolver } from "./resolve-package-path.js";
import { transformCode } from "./test-helpers/transform.js";
import { transformMockArguments } from "./transform-mock-args.js";

describe(transformMockArguments, () => {
	it("should transform relative string in jest.mock to instance expression", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.mock\(script\.Parent\.foo\)/);
	});

	it("should transform relative string in jest.unmock to instance expression", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.unmock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.unmock\(script\.Parent\.foo\)/);
	});

	it("should preserve factory function when transforming first arg", () => {
		expect.assertions(2);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => ({}));
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.mock\(script\.Parent\.foo,/);
		expect(result).toMatch(/\(\) => \(\{\}\)/);
	});

	it("should transform both args in chained calls", () => {
		expect.assertions(2);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./a").unmock("./b");
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.mock\(script\.Parent\.a\)/);
		expect(result).toMatch(/\.unmock\(script\.Parent\.b\)/);
	});

	it("should leave non-relative string unchanged", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("@rbxts/some-package");
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.mock\("@rbxts\/some-package"\)/);
	});

	it("should leave chained non-relative strings unchanged", () => {
		expect.assertions(2);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("@rbxts/a").unmock("@rbxts/b");
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.mock\("@rbxts\/a"\)/);
		expect(result).toMatch(/\.unmock\("@rbxts\/b"\)/);
	});

	it("should leave non-string first arg unchanged", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { SomeService } from "@rbxts/services";
jest.mock(SomeService.path, () => ({}));
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.mock\(SomeService\.path/);
	});

	it("should leave AsExpression-wrapped strings unchanged", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo" as unknown as ModuleScript);
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.mock\("\.\/foo" as unknown as ModuleScript\)/);
	});

	it("should transform nested path segments", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./a/b/c");
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.mock\(script\.Parent\.a\.b\.c\)/);
	});

	it("should transform parent path", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("../foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.mock\(script\.Parent\.Parent\.foo\)/);
	});

	it("should pass through non-expression statements unchanged", () => {
		expect.assertions(1);

		const source = ts.createSourceFile("test.ts", "const x = 1;", ts.ScriptTarget.ESNext, true);
		const statement = source.statements[0]!;
		const result = transformMockArguments(ts.factory, [statement]);

		expect(result[0]).toBe(statement);
	});

	it("should pass through call with no arguments unchanged", () => {
		expect.assertions(1);

		const source = ts.createSourceFile("test.ts", "foo();", ts.ScriptTarget.ESNext, true);
		const statement = source.statements[0]!;
		const result = transformMockArguments(ts.factory, [statement]);

		expect(result[0]).toBe(statement);
	});

	it("should resolve package specifier when resolver is provided", () => {
		expect.assertions(1);

		const resolver: PackageResolver = {
			resolveToRbxPath: () => [
				"ReplicatedStorage",
				"rbxts_include",
				"node_modules",
				"@rbxts",
				"services",
			],
		};

		const source = ts.createSourceFile(
			"test.ts",
			'jest.mock("@rbxts/services");',
			ts.ScriptTarget.ESNext,
			true,
		);
		const result = transformMockArguments(
			ts.factory,
			[...source.statements],
			resolver,
			"/src/test.ts",
		);

		// eslint-disable-next-line unicorn/no-keyword-prefix -- TS API property name
		const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
		const printed = printer.printFile(ts.factory.updateSourceFile(source, result));

		expect(printed).toMatch(
			/jest\.mock\(game\.GetService\("ReplicatedStorage"\)!\.FindFirstChild\("rbxts_include"\)!\.FindFirstChild\("node_modules"\)!\.FindFirstChild\("@rbxts"\)!\.FindFirstChild\("services"\) as ModuleScript\)/,
		);
	});

	it("should leave package specifier unchanged when no resolver provided", () => {
		expect.assertions(1);

		const source = ts.createSourceFile(
			"test.ts",
			'jest.mock("@rbxts/services");',
			ts.ScriptTarget.ESNext,
			true,
		);
		const result = transformMockArguments(ts.factory, [...source.statements]);

		expect(result[0]).toBe(source.statements[0]);
	});
});
