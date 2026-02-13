import { describe, expect, it } from "vitest";

import { transformCode } from "./test-helpers/transform.js";

describe("hoist-jest", () => {
	it("should hoist jest.mock above imports", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
jest.mock("./foo");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist jest.unmock above imports", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
jest.unmock("./foo");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist both mock and unmock", () => {
		expect.assertions(1);

		const input = `
import { a } from "./a";
jest.mock("./a");
jest.unmock("./b");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should keep @rbxts/jest-globals import first", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist mock-prefixed variables", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
const mockFoo = jest.fn();
jest.mock("./foo", () => ({ foo: mockFoo }));
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	// cspell:ignore dontMock
	it("should leave non-hoistable jest calls in place", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
jest.dontMock("./foo");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should ignore shadowed jest binding", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
const jest = { mock: () => {} };
jest.mock("./foo");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should ignore non-jest objects", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
other.mock("./foo");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should preserve factory functions in jest.mock", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
jest.mock("./foo", () => ({ default: 42 }));
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should not hoist plain function calls", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
foo("./bar");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should not hoist non-call expression statements", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
x = 5;
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should pass through unchanged when no jest calls", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
console.log(foo);
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should be idempotent when already hoisted", () => {
		expect.assertions(1);

		const input = `
jest.mock("./foo");
import { foo } from "./foo";
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

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

	it("should treat side-effect jest-globals import as no binding", () => {
		expect.assertions(1);

		const input = `
import "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/^import "@rbxts\/jest-globals";\njest\.mock/);
	});

	it("should treat non-jest named import as no binding", () => {
		expect.assertions(1);

		const input = `
import { describe } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/^import.*describe.*\njest\.mock/);
	});

	it("should hoist global jest when no imports", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
jest.mock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/^jest\.mock.*\nimport/);
	});
});
