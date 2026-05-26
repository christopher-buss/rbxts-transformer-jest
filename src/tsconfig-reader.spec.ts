/* eslint-disable sonar/no-duplicate-string -- test assertion values */
import path from "node:path";
import { describe, expect, it } from "vitest";

import { defaultReadTsConfig, resolveRojoFromTsConfig } from "./tsconfig-reader.js";

const PROJECT_DIRECTORY = "/project";
const LEAF_PATH = path.resolve(PROJECT_DIRECTORY, "./tsconfig.json");

describe(defaultReadTsConfig, () => {
	it("should return the parsed config for an existing tsconfig file", () => {
		expect.assertions(1);

		const result = defaultReadTsConfig(path.resolve("tsconfig.json"));

		expect(result).toMatchObject({});
	});

	it("should return undefined when the file cannot be read", () => {
		expect.assertions(1);

		const result = defaultReadTsConfig("/nonexistent/path/tsconfig.json");

		expect(result).toBeUndefined();
	});
});

describe(resolveRojoFromTsConfig, () => {
	it("should resolve rbxts.rojo relative to the leaf tsconfig", () => {
		expect.assertions(1);

		const config = { rbxts: { rojo: "./default.project.json" } };
		const result = resolveRojoFromTsConfig(LEAF_PATH, () => config);

		expect(result).toBe(path.resolve(PROJECT_DIRECTORY, "./default.project.json"));
	});

	it("should follow extends chain to find rbxts.rojo in a base config", () => {
		expect.assertions(1);

		const basePath = path.resolve(PROJECT_DIRECTORY, "./tsconfig.base.json");
		const configs: Record<string, unknown> = {
			[basePath]: { rbxts: { rojo: "./game.project.json" } },
			[LEAF_PATH]: { extends: "./tsconfig.base.json" },
		};

		const result = resolveRojoFromTsConfig(LEAF_PATH, (configPath) => configs[configPath]);

		expect(result).toBe(path.resolve(PROJECT_DIRECTORY, "./game.project.json"));
	});

	it("should append .json when extends omits the extension", () => {
		expect.assertions(1);

		const basePath = path.resolve(PROJECT_DIRECTORY, "./tsconfig.base.json");
		const configs: Record<string, unknown> = {
			[basePath]: { rbxts: { rojo: "./out.project.json" } },
			[LEAF_PATH]: { extends: "./tsconfig.base" },
		};

		const result = resolveRojoFromTsConfig(LEAF_PATH, (configPath) => configs[configPath]);

		expect(result).toBe(path.resolve(PROJECT_DIRECTORY, "./out.project.json"));
	});

	it("should stop walking when extends is a package name", () => {
		expect.assertions(1);

		const config = { extends: "@isentinel/tsconfig" };
		const result = resolveRojoFromTsConfig(LEAF_PATH, () => config);

		expect(result).toBeUndefined();
	});

	it("should not revisit configs already seen", () => {
		expect.assertions(2);

		let reads = 0;
		const aPath = path.resolve(PROJECT_DIRECTORY, "./a.json");
		const bPath = path.resolve(PROJECT_DIRECTORY, "./b.json");
		const configs: Record<string, unknown> = {
			[aPath]: { extends: "./b.json" },
			[bPath]: { extends: "./a.json" },
		};

		const result = resolveRojoFromTsConfig(aPath, (configPath) => {
			reads += 1;
			return configs[configPath];
		});

		expect(result).toBeUndefined();
		expect(reads).toBe(2);
	});

	it("should ignore non-string extends values", () => {
		expect.assertions(1);

		const config = { extends: ["./a.json", "./b.json"] };
		const result = resolveRojoFromTsConfig(LEAF_PATH, () => config);

		expect(result).toBeUndefined();
	});

	it("should ignore non-string rojo values", () => {
		expect.assertions(1);

		const result = resolveRojoFromTsConfig(LEAF_PATH, () => ({ rbxts: { rojo: 42 } }));

		expect(result).toBeUndefined();
	});

	it("should ignore non-object rbxts values", () => {
		expect.assertions(1);

		const result = resolveRojoFromTsConfig(LEAF_PATH, () => ({ rbxts: "not-an-object" }));

		expect(result).toBeUndefined();
	});

	it("should ignore non-object config values", () => {
		expect.assertions(1);

		const result = resolveRojoFromTsConfig(LEAF_PATH, () => "not-an-object");

		expect(result).toBeUndefined();
	});
});
