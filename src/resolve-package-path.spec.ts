/* eslint-disable sonar/no-duplicate-string -- test assertion values */
import ts from "typescript";
import { describe, expect, it } from "vitest";

import type { Dependencies, PackageResolver } from "./resolve-package-path.js";
import {
	createPackageResolver,
	findRojoConfig,
	rbxPathToExpression,
	resolvePackagePath,
	tryLoadDependencies,
} from "./resolve-package-path.js";

const { createPrinter, createSourceFile, EmitHint, factory, NewLineKind, ScriptTarget } = ts;

// eslint-disable-next-line unicorn/no-keyword-prefix -- TS API property name
const printer = createPrinter({ newLine: NewLineKind.LineFeed });
const dummyFile = createSourceFile("test.ts", "", ScriptTarget.ESNext);

function print(node: ts.Expression | undefined): string {
	return printer.printNode(EmitHint.Expression, node!, dummyFile);
}

describe(rbxPathToExpression, () => {
	it("should return undefined for empty path", () => {
		expect.assertions(1);

		const result = rbxPathToExpression(factory, []);

		expect(result).toBeUndefined();
	});

	it("should wrap first segment in game.GetService()", () => {
		expect.assertions(1);

		const result = rbxPathToExpression(factory, ["ReplicatedStorage"]);

		expect(print(result)).toBe('game.GetService("ReplicatedStorage")');
	});

	it("should chain segments with FindFirstChild", () => {
		expect.assertions(1);

		const result = rbxPathToExpression(factory, [
			"ReplicatedStorage",
			"rbxts_include",
			"node_modules",
		]);

		expect(print(result)).toBe(
			'game.GetService("ReplicatedStorage")!.FindFirstChild("rbxts_include")!.FindFirstChild("node_modules") as ModuleScript',
		);
	});

	it("should handle @-prefixed segments with FindFirstChild", () => {
		expect.assertions(1);

		const result = rbxPathToExpression(factory, [
			"ReplicatedStorage",
			"rbxts_include",
			"node_modules",
			"@rbxts",
			"services",
		]);

		expect(print(result)).toBe(
			'game.GetService("ReplicatedStorage")!.FindFirstChild("rbxts_include")!.FindFirstChild("node_modules")!.FindFirstChild("@rbxts")!.FindFirstChild("services") as ModuleScript',
		);
	});

	it("should handle hyphenated segments with FindFirstChild", () => {
		expect.assertions(1);

		const result = rbxPathToExpression(factory, [
			"ReplicatedStorage",
			"rbxts_include",
			"node_modules",
			"@rbxts",
			"jest-globals",
		]);

		expect(print(result)).toBe(
			'game.GetService("ReplicatedStorage")!.FindFirstChild("rbxts_include")!.FindFirstChild("node_modules")!.FindFirstChild("@rbxts")!.FindFirstChild("jest-globals") as ModuleScript',
		);
	});
});

describe(resolvePackagePath, () => {
	function createMockResolver(rbxPath: ReadonlyArray<string> | undefined): PackageResolver {
		return {
			resolveToRbxPath(_specifier: string, _containingFile: string) {
				return rbxPath;
			},
		};
	}

	it("should resolve package specifier to instance expression", () => {
		expect.assertions(1);

		const resolver = createMockResolver([
			"ReplicatedStorage",
			"rbxts_include",
			"node_modules",
			"@rbxts",
			"services",
		]);

		const result = resolvePackagePath(factory, "@rbxts/services", "/src/test.ts", resolver);

		expect(print(result)).toBe(
			'game.GetService("ReplicatedStorage")!.FindFirstChild("rbxts_include")!.FindFirstChild("node_modules")!.FindFirstChild("@rbxts")!.FindFirstChild("services") as ModuleScript',
		);
	});

	it("should return undefined when resolver returns undefined", () => {
		expect.assertions(1);

		const resolver = createMockResolver(undefined);

		const result = resolvePackagePath(factory, "@rbxts/services", "/src/test.ts", resolver);

		expect(result).toBeUndefined();
	});

	it("should skip relative specifiers", () => {
		expect.assertions(1);

		const resolver = createMockResolver(["ReplicatedStorage", "foo"]);

		const result = resolvePackagePath(factory, "./foo", "/src/test.ts", resolver);

		expect(result).toBeUndefined();
	});
});

describe(createPackageResolver, () => {
	function mockProgram(options: Record<string, unknown>): ts.Program {
		return { getCompilerOptions: () => options } as unknown as ts.Program;
	}

	function mockPathTranslator(transform = (filePath: string) => filePath) {
		return function PathTranslator() {
			return { getOutputPath: transform };
		} as unknown as Dependencies["PathTranslator"];
	}

	function mockDeps(
		rojoPath: string | undefined,
		rbxPathResult?: ReadonlyArray<string>,
	): Dependencies {
		return {
			PathTranslator: mockPathTranslator(),
			RojoResolver: {
				findRojoConfigFilePath: () => ({ path: rojoPath }),
				fromPath: () => ({ getRbxPathFromFilePath: () => rbxPathResult }),
			},
		};
	}

	it("should return undefined when configFilePath is missing", () => {
		expect.assertions(1);

		expect(createPackageResolver(mockProgram({}))).toBeUndefined();
	});

	it("should return undefined when outDir is missing", () => {
		expect.assertions(1);

		const program = mockProgram({ configFilePath: "/project/tsconfig.json" });

		expect(createPackageResolver(program)).toBeUndefined();
	});

	it("should return undefined when dependencies are not available", () => {
		expect.assertions(1);

		const program = mockProgram({
			configFilePath: "/project/tsconfig.json",
			outDir: "/project/out",
		});

		expect(createPackageResolver(program, { loadDependencies: () => {} })).toBeUndefined();
	});

	it("should return undefined when rojo config is not found", () => {
		expect.assertions(1);

		const program = mockProgram({
			configFilePath: "/project/tsconfig.json",
			outDir: "/project/out",
		});

		expect(
			createPackageResolver(program, {
				loadDependencies: () => mockDeps(undefined),
			}),
		).toBeUndefined();
	});

	it("should return resolver when all dependencies are available", () => {
		expect.assertions(1);

		const program = mockProgram({
			configFilePath: "/project/tsconfig.json",
			outDir: "/project/out",
		});
		const deps = mockDeps("/project/default.project.json");

		const resolver = createPackageResolver(program, { loadDependencies: () => deps });

		expect(resolver).toBeDefined();
	});

	it("should return undefined from resolveToRbxPath when module not found", () => {
		expect.assertions(1);

		const program = mockProgram({
			configFilePath: "/project/tsconfig.json",
			outDir: "/project/out",
		});
		const deps = mockDeps("/project/default.project.json", [
			"ReplicatedStorage",
			"rbxts_include",
		]);

		const resolver = createPackageResolver(program, {
			loadDependencies: () => deps,
			resolveModule: () => {},
		});
		const result = resolver?.resolveToRbxPath("@rbxts/services", "/project/src/test.ts");

		expect(result).toBeUndefined();
	});

	it("should resolve through full pipeline when module is found", () => {
		expect.assertions(1);

		const program = mockProgram({
			configFilePath: "/project/tsconfig.json",
			outDir: "/project/out",
		});
		const deps = mockDeps("/project/default.project.json", [
			"ReplicatedStorage",
			"rbxts_include",
			"node_modules",
			"@rbxts",
			"services",
		]);

		const resolver = createPackageResolver(program, {
			loadDependencies: () => deps,
			resolveModule: () => "/project/node_modules/@rbxts/services/index.d.ts",
		});
		const result = resolver?.resolveToRbxPath("@rbxts/services", "/project/src/test.ts");

		expect(result).toStrictEqual([
			"ReplicatedStorage",
			"rbxts_include",
			"node_modules",
			"@rbxts",
			"services",
		]);
	});

	it("should strip index file segment from rojo-resolved rbx path", () => {
		expect.assertions(1);

		const program = mockProgram({
			configFilePath: "/project/tsconfig.json",
			outDir: "/project/out",
		});
		const deps: Dependencies = {
			PathTranslator: mockPathTranslator(),
			RojoResolver: {
				findRojoConfigFilePath: () => ({ path: "/project/default.project.json" }),
				fromPath: () => {
					return {
						getRbxPathFromFilePath: () => [
							"ReplicatedStorage",
							"rbxts_include",
							"node_modules",
							"@rbxts",
							"services",
							"index.d.ts",
						],
					};
				},
			},
		};

		const resolver = createPackageResolver(program, {
			loadDependencies: () => deps,
			resolveModule: () => "/project/node_modules/@rbxts/services/index.d.ts",
		});
		const result = resolver?.resolveToRbxPath("@rbxts/services", "/project/src/test.ts");

		expect(result).toStrictEqual([
			"ReplicatedStorage",
			"rbxts_include",
			"node_modules",
			"@rbxts",
			"services",
		]);
	});
});

describe(tryLoadDependencies, () => {
	it("should load rojo-resolver and path-translator when available", () => {
		expect.assertions(2);

		const result = tryLoadDependencies();

		expect(result?.RojoResolver).toBeDefined();
		expect(result?.PathTranslator).toBeDefined();
	});
});

describe(findRojoConfig, () => {
	it("should return undefined when findRojoConfigFilePath throws", () => {
		expect.assertions(1);

		const resolver = {
			findRojoConfigFilePath: () => {
				throw new Error("ENOENT");
			},
			fromPath: () => ({ getRbxPathFromFilePath: () => {} }),
		};

		expect(findRojoConfig(resolver, "/nonexistent")).toBeUndefined();
	});

	it("should return path when config is found", () => {
		expect.assertions(1);

		const resolver = {
			findRojoConfigFilePath: () => ({ path: "/project/default.project.json" }),
			fromPath: () => ({ getRbxPathFromFilePath: () => {} }),
		};

		expect(findRojoConfig(resolver, "/project")).toBe("/project/default.project.json");
	});

	it("should return undefined when path is undefined", () => {
		expect.assertions(1);

		const resolver = {
			findRojoConfigFilePath: () => ({ path: undefined }),
			fromPath: () => ({ getRbxPathFromFilePath: () => {} }),
		};

		expect(findRojoConfig(resolver, "/project")).toBeUndefined();
	});
});
