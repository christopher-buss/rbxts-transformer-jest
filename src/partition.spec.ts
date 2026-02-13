import { describe, expect, it } from "vitest";

import { transformCode } from "./test-helpers/transform.js";

describe("partition", () => {
	it("should hoist jest.mock above imports", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist jest.unmock above imports", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.unmock("./foo");
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	it("should hoist both mock and unmock", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
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

	it("should preserve factory functions in jest.mock", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
jest.mock("./foo", () => ({ default: 42 }));
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

	it("should ignore non-jest objects", () => {
		expect.assertions(1);

		const input = `
import { foo } from "./foo";
other.mock("./foo");
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
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo");
import { foo } from "./foo";
`;

		expect(transformCode(input)).toMatchSnapshot();
	});

	describe("mock-prefix variable hoisting (REQ-006)", () => {
		it("should hoist single mock-prefix var referenced in factory", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
const mockFoo = jest.fn();
jest.mock("./foo", () => ({ foo: mockFoo }));
`;

			const result = transformCode(input);

			expect(result).toMatchSnapshot();
		});

		it("should hoist multiple mock-prefix vars", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
import { a } from "./a";
const mockA = jest.fn();
const mockB = jest.fn();
jest.mock("./a", () => ({ a: mockA, b: mockB }));
`;

			const result = transformCode(input);

			expect(result).toMatchSnapshot();
		});

		it("should not hoist non-mock-prefix var", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
const helper = jest.fn();
jest.mock("./foo", () => ({ foo: helper }));
`;

			expect(() => transformCode(input)).toThrowError("helper");
		});

		it("should not hoist let mock-prefix var", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
let mockFoo = jest.fn();
jest.mock("./foo", () => ({ foo: mockFoo }));
`;

			const result = transformCode(input);

			expect(result).toMatch(/import.*foo.*\nlet mockFoo/);
		});

		it("should not hoist mock-prefix var not referenced in factory", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
const mockBar = jest.fn();
jest.mock("./foo", () => ({ foo: mockFoo }));
`;

			const result = transformCode(input);

			expect(result).toMatch(/import.*foo.*\nconst mockBar/);
		});

		it("should not hoist mock-prefix var when no factory exists", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
const mockFoo = jest.fn();
jest.mock("./foo");
`;

			const result = transformCode(input);

			expect(result).toMatch(/import.*foo.*\nconst mockFoo/);
		});
	});

	describe("chained calls (REQ-008)", () => {
		it("should hoist chained unmock calls", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
import { a } from "./a";
jest.unmock("./a").unmock("./b");
`;

			const result = transformCode(input);

			expect(result).toMatch(/^import.*jest.*\njest\.unmock.*\.unmock/);
		});

		it("should hoist chained mock+unmock", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
import { a } from "./a";
jest.mock("./a").unmock("./b");
`;

			const result = transformCode(input);

			expect(result).toMatch(/^import.*jest.*\njest\.mock.*\.unmock/);
		});

		it("should hoist 3-deep chained calls", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
import { a } from "./a";
jest.mock("./a").unmock("./b").mock("./c");
`;

			const result = transformCode(input);

			expect(result).toMatch(/^import.*jest.*\njest\.mock.*\.unmock.*\.mock/);
		});

		it("should not hoist chained calls on non-jest object", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
import { a } from "./a";
other.mock("./a").unmock("./b");
`;

			const result = transformCode(input);

			expect(result).toMatch(/import.*from "\.\/a";\nother\.mock/);
		});

		it("should validate factory in chained mock call", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
jest.mock("./foo", () => badRef).unmock("./bar");
`;

			expect(() => transformCode(input)).toThrowError("badRef");
		});

		it("should hoist mock-prefix var referenced in chained mock factory", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
import { foo } from "./foo";
const mockFoo = jest.fn();
jest.mock("./foo", () => ({ foo: mockFoo })).unmock("./bar");
`;

			const result = transformCode(input);

			expect(result).toMatch(/^import.*jest.*\nconst mockFoo.*\njest\.mock/);
		});

		it("should hoist chained calls with namespace import", () => {
			expect.assertions(1);

			const input = `
import * as JG from "@rbxts/jest-globals";
import { a } from "./a";
JG.jest.mock("./a").unmock("./b");
`;

			const result = transformCode(input);

			expect(result).toMatch(/^import \* as JG.*\nJG\.jest\.mock.*\.unmock/);
		});
	});

	describe("block scope hoisting (REQ-007)", () => {
		it("should hoist jest.mock within if block body", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
if (true) {
  jest.mock("./foo");
  console.log("hello");
}
`;

			expect(transformCode(input)).toMatchSnapshot();
		});

		it("should hoist jest.mock within function body", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
function setup() {
  console.log("before");
  jest.mock("./foo");
}
`;

			expect(transformCode(input)).toMatchSnapshot();
		});

		it("should hoist jest.mock within arrow function body", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
const setup = () => {
  console.log("before");
  jest.mock("./foo");
};
`;

			expect(transformCode(input)).toMatchSnapshot();
		});

		it("should hoist jest.mock within try block", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
try {
  console.log("before");
  jest.mock("./foo");
} catch (e) {}
`;

			expect(transformCode(input)).toMatchSnapshot();
		});

		it("should hoist jest.mock within catch block", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
try {} catch (e) {
  console.log("before");
  jest.mock("./foo");
}
`;

			expect(transformCode(input)).toMatchSnapshot();
		});

		it("should hoist jest.mock in nested blocks", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
function outer() {
  if (true) {
    console.log("before");
    jest.mock("./foo");
  }
}
`;

			expect(transformCode(input)).toMatchSnapshot();
		});

		it("should not escape block scope to parent", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
console.log("top level");
if (true) {
  jest.mock("./foo");
}
`;

			const result = transformCode(input);

			// jest.mock should stay inside the if block, not escape to top level
			expect(result).toMatch(/console\.log\("top level"\);\nif \(true\) \{\n\s+jest\.mock/);
		});

		it("should hoist mock-prefix vars within block", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
function setup() {
  const mockFoo = jest.fn();
  console.log("between");
  jest.mock("./foo", () => ({ foo: mockFoo }));
}
`;

			expect(transformCode(input)).toMatchSnapshot();
		});

		it("should validate factory within block", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
function setup() {
  jest.mock("./foo", () => badRef);
}
`;

			expect(() => transformCode(input)).toThrowError("badRef");
		});

		it("should handle chained calls within block", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
function setup() {
  console.log("before");
  jest.mock("./a").unmock("./b");
}
`;

			expect(transformCode(input)).toMatchSnapshot();
		});

		it("should leave block unchanged when no hoistable calls", () => {
			expect.assertions(1);

			const input = `
import { jest } from "@rbxts/jest-globals";
function setup() {
  console.log("hello");
  const x = 1;
}
`;

			expect(transformCode(input)).toMatchSnapshot();
		});

		it("should hoist in beforeEach callback", () => {
			expect.assertions(1);

			const input = `
import { jest, beforeEach } from "@rbxts/jest-globals";
beforeEach(() => {
  console.log("setup");
  jest.mock("./foo");
  jest.mock("./bar");
});
`;

			expect(transformCode(input)).toMatchSnapshot();
		});
	});
});
