/* eslint-disable sonar/no-duplicate-string -- test assertion values */
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { resolveRelativeModulePath } from "./resolve-module-path.js";

const { createPrinter, createSourceFile, EmitHint, factory, NewLineKind, ScriptTarget } = ts;

// eslint-disable-next-line unicorn/no-keyword-prefix -- TS API property name
const printer = createPrinter({ newLine: NewLineKind.LineFeed });
const dummyFile = createSourceFile("test.ts", "", ScriptTarget.ESNext);

function print(node: ts.Expression | undefined): string {
	return printer.printNode(EmitHint.Expression, node!, dummyFile);
}

describe(resolveRelativeModulePath, () => {
	it("should resolve ./foo to script.Parent.foo", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./foo");

		expect(print(result)).toBe("script.Parent.foo");
	});

	it("should resolve ../foo to script.Parent.Parent.foo", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "../foo");

		expect(print(result)).toBe("script.Parent.Parent.foo");
	});

	it("should resolve ./a/b/c to script.Parent.a.b.c", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./a/b/c");

		expect(print(result)).toBe("script.Parent.a.b.c");
	});

	it("should resolve ../../foo to script.Parent.Parent.Parent.foo", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "../../foo");

		expect(print(result)).toBe("script.Parent.Parent.Parent.foo");
	});

	it("should strip .ts extension", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./foo.ts");

		expect(print(result)).toBe("script.Parent.foo");
	});

	it("should strip .d.ts extension", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./foo.d.ts");

		expect(print(result)).toBe("script.Parent.foo");
	});

	it("should return undefined for non-relative paths", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "@rbxts/something");

		expect(result).toBeUndefined();
	});

	it("should use bracket access for hyphenated segments", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./my-module");

		expect(print(result)).toBe('script.Parent["my-module"]');
	});

	it("should collapse /index to parent", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./foo/index");

		expect(print(result)).toBe("script.Parent.foo");
	});

	it("should return undefined for empty module name", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./");

		expect(result).toBeUndefined();
	});

	it("should strip trailing slash before processing", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./foo/");

		expect(print(result)).toBe("script.Parent.foo");
	});

	it("should strip .tsx extension", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./foo.tsx");

		expect(print(result)).toBe("script.Parent.foo");
	});

	it("should strip .luau extension", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./foo.luau");

		expect(print(result)).toBe("script.Parent.foo");
	});

	it("should strip .lua extension", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./foo.lua");

		expect(print(result)).toBe("script.Parent.foo");
	});

	it("should use bracket access only for hyphenated segments", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./a/my-mod/b");

		expect(print(result)).toBe('script.Parent.a["my-mod"].b');
	});

	it("should strip .d.ts from index file", () => {
		expect.assertions(1);

		const result = resolveRelativeModulePath(factory, "./foo/index.d.ts");

		expect(print(result)).toBe("script.Parent.foo");
	});
});
