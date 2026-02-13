import { describe, expect, it } from "vitest";

import { transformCode } from "./test-helpers/transform.js";

describe("shadowing", () => {
	it("should ignore shadowed jest binding", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
const jest = { mock: () => {} };
jest.mock("./foo");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should not hoist when jest is shadowed after import", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
const jest = { mock: () => {} };
jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/const jest.*\njest\.mock/);
	});

	it("should not hoist when aliased jest is shadowed after import", () => {
		expect.assertions(1);

		const input = `
import { jest as j } from "@rbxts/jest-globals";
import { foo } from "./foo";
const j = { mock: () => {} };
j.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/const j.*\nj\.mock/);
	});

	it("should not hoist when namespace is shadowed after import", () => {
		expect.assertions(1);

		const input = `
import * as JG from "@rbxts/jest-globals";
import { foo } from "./foo";
const JG = { jest: { mock: () => {} } };
JG.jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/const JG.*\nJG\.jest\.mock/);
	});

	it("should not hoist when jest is shadowed by function declaration", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
function jest() {}
jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/function jest\(\).*\njest\.mock/);
	});

	it("should still hoist when non-jest name is shadowed", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
const other = { mock: () => {} };
jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/^import.*jest.*\njest\.mock/);
	});
});
