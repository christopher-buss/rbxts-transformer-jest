import { describe, expect, it } from "vitest";

import { transformCode } from "./test-helpers/transform.js";

describe("factory-validation", () => {
	it("should hoist mock with no factory", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist factory referencing allowed identifiers", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo", () => ({ x: undefined, y: NaN, z: Infinity }));
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist factory referencing jest and expect", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo", () => jest.fn());
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist factory referencing mock-prefixed variable", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo", () => mockFoo);
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist factory with local variables", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo", () => { const x = 1; return x; });
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist factory with function parameters", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo", () => { return (a: string) => a; });
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist factory referencing coverage variable", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo", () => __cov_x);
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist factory referencing __coverage variable", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo", () => cov_hash123);
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should throw on factory referencing outer variable", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo", () => someVar);
`;

		expect(() => transformCode(input)).toThrowError("someVar");
	});

	it("should throw on factory calling outer function", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo", () => someFunction());
`;

		expect(() => transformCode(input)).toThrowError("someFunction");
	});

	it("should produce Babel-compatible error message", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => badVar);
`;

		expect(() => transformCode(input)).toThrowError(
			/The module factory of `jest\.mock\(\)` is not allowed to reference any out-of-scope variables\.\nInvalid variable access: badVar\nAllowed objects: expect, jest, Infinity, NaN, undefined\.\nNote: This is a precaution to guard against uninitialized mock variables\. If it is ensured that the mock is required lazily, variable names prefixed with `mock` \(case insensitive\) are permitted\./,
		);
	});

	it("should not validate non-function second argument", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo", options);
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should not validate unmock factories", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.unmock("./foo");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should allow property access on allowed objects", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => ({ fn: jest.fn() }));
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should allow shorthand property with allowed name", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => ({ undefined }));
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should skip property names in object literals", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => ({ someVar: 42 }));
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should validate with namespace jest import", () => {
		expect.assertions(1);

		const input = `
import * as JG from "@rbxts/jest-globals";
import { foo } from "./foo";
JG.jest.mock("./foo", () => badRef);
`;

		expect(() => transformCode(input)).toThrowError("badRef");
	});

	it("should allow case-insensitive mock prefix", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => ({ a: MockClass, b: MOCK_VALUE, c: mockFn }));
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should allow destructuring parameters in factory", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => { const { a, b } = { a: 1, b: 2 }; return { a, b }; });
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should allow function declarations inside factory", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => { function helper() { return 1; } return helper(); });
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should allow catch clause variable", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => { try {} catch (e) { return e; } });
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should allow array destructuring parameters in factory", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => { const [a, b] = [1, 2]; return { a, b }; });
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should allow nested object destructuring in factory", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => { const { a: { b } } = { a: { b: 1 } }; return b; });
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should allow array destructuring with holes in factory", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => { const [, b] = [1, 2]; return b; });
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should skip type-annotated parameters in factory", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => (_self: unknown, action: string, entity: Entity) => {});
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should skip as-cast types in factory", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => (undefined as SomeType));
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should skip generic type arguments on calls in factory", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock<SomeType>("./foo", () => ({}));
`;

		expect(transformCode(input)).toMatchSnapshot();
	});
});
