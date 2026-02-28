import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import transformer from "./index.js";
import { mockProgram } from "./test-helpers/transform.js";

const MOCK_RBX_PATH = ["ReplicatedStorage", "rbxts_include", "node_modules", "@rbxts", "jest"];

const mockResolver = {
	resolveToRbxPath: () => MOCK_RBX_PATH,
};

vi.mock(import("./resolve-package-path.js"), async (importOriginal) => {
	const original = await importOriginal();
	return {
		...original,
		createPackageResolver: () => mockResolver,
	};
});

// eslint-disable-next-line unicorn/no-keyword-prefix -- TS API property name
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

function transformWithResolver(input: string): string {
	const sourceFile = ts.createSourceFile("test.ts", input, ts.ScriptTarget.ESNext, true);
	const factory = transformer(mockProgram);
	const result = ts.transform(sourceFile, [factory]);
	const transformed = result.transformed[0];
	if (transformed === undefined) {
		throw new Error("Transform produced no output");
	}

	const output = printer.printFile(transformed);
	result.dispose();
	return output;
}

describe("jest.requireActual inside jest.mock factory with resolver", () => {
	it("should resolve package specifier in jest.requireActual inside factory", () => {
		expect.assertions(2);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("@rbxts/jest", () => {
    const actual = jest.requireActual("@rbxts/jest");
    return actual;
});
`;

		const result = transformWithResolver(input);

		expect(result).toMatch(/jest\.mock\(game\.GetService\("ReplicatedStorage"\)/);
		expect(result).toMatch(/jest\.requireActual\(game\.GetService\("ReplicatedStorage"\)/);
	});
});
