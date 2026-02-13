import { describe, expect, it } from "vitest";

import { transformCode } from "./test-helpers/transform.js";

describe("collect-jest-names", () => {
	it("should hoist aliased jest import calls", () => {
		expect.assertions(1);

		const input = `
import { jest as j } from "@rbxts/jest-globals";
import { foo } from "./foo";
j.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/^import.*jest as j.*\nj\.mock/);
	});

	it("should hoist namespace jest import calls", () => {
		expect.assertions(1);

		const input = `
import * as JG from "@rbxts/jest-globals";
import { foo } from "./foo";
JG.jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/^import \* as JG.*\nJG\.jest\.mock/);
	});

	it("should not hoist namespace without .jest accessor", () => {
		expect.assertions(1);

		const input = `
import * as JG from "@rbxts/jest-globals";
import { foo } from "./foo";
JG.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/import.*foo.*\nJG\.mock/);
	});

	it("should not hoist with side-effect jest-globals import (no binding)", () => {
		expect.assertions(1);

		const input = `
import "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/import.*foo.*\njest\.mock/);
	});

	it("should not hoist with non-jest named import (no binding)", () => {
		expect.assertions(1);

		const input = `
import { describe } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/import.*foo.*\njest\.mock/);
	});

	it("should not hoist when no jest-globals import exists", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/import.*foo.*\njest\.mock/);
	});
});
