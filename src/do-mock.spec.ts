import { describe, expect, it } from "vitest";

import { transformCode } from "./test-helpers/transform.js";

describe("jest.doMock string path transformation", () => {
	it("should transform relative string in jest.doMock to instance expression", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.doMock("./foo", () => ({}));
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.doMock\(script\.Parent\.foo,/);
	});

	it("should preserve the factory when transforming jest.doMock first arg", () => {
		expect.assertions(2);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.doMock("./foo", () => ({ value: 1 }));
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.doMock\(script\.Parent\.foo,/);
		expect(result).toMatch(/\(\) => \(\{ value: 1 \}\)/);
	});

	it("should transform nested relative path in jest.doMock", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.doMock("./a/b/c", () => ({}));
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.doMock\(script\.Parent\.a\.b\.c,/);
	});

	it("should transform parent path in jest.doMock", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.doMock("../foo", () => ({}));
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.doMock\(script\.Parent\.Parent\.foo,/);
	});

	it("should transform jest.doMock with aliased jest import", () => {
		expect.assertions(1);

		const input = `
import { jest as j } from "@rbxts/jest-globals";
j.doMock("./foo", () => ({}));
`;

		const result = transformCode(input);

		expect(result).toMatch(/j\.doMock\(script\.Parent\.foo,/);
	});

	it("should transform jest.doMock with namespace import", () => {
		expect.assertions(1);

		const input = `
import * as JG from "@rbxts/jest-globals";
JG.jest.doMock("./foo", () => ({}));
`;

		const result = transformCode(input);

		expect(result).toMatch(/JG\.jest\.doMock\(script\.Parent\.foo,/);
	});

	it("should transform both first args in chained jest.doMock", () => {
		expect.assertions(2);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.doMock("./a", () => ({})).doMock("./b", () => ({}));
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.doMock\(script\.Parent\.a,/);
		expect(result).toMatch(/\.doMock\(script\.Parent\.b,/);
	});

	it("should leave non-string first arg in jest.doMock unchanged", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { SomeService } from "@rbxts/services";
jest.doMock(SomeService.path, () => ({}));
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.doMock\(SomeService\.path/);
	});

	it("should not transform doMock on non-jest object", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
other.doMock("./foo", () => ({}));
`;

		const result = transformCode(input);

		expect(result).toMatch(/other\.doMock\("\.\/foo"/);
	});

	it("should not transform doMock on a top-level shadowed jest binding", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
const jest = fake;
jest.doMock("./foo", () => ({}));
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.doMock\("\.\/foo"/);
	});

	it("should not hoist jest.doMock above import statements", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { helper } from "./helper";
jest.doMock("./foo", () => ({}));
`;

		const result = transformCode(input);
		const doMockIndex = result.indexOf("doMock");
		const helperImportIndex = result.indexOf('from "./helper"');

		expect(doMockIndex).toBeGreaterThan(helperImportIndex);
	});

	it("should not validate the jest.doMock factory against scope", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { createServicesMock } from "./mocks";
jest.doMock("./foo", () => createServicesMock());
`;

		expect(() => transformCode(input)).not.toThrowError();
	});
});

describe("jest.dontMock string path transformation", () => {
	it("should transform relative string in jest.dontMock to instance expression", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
jest.dontMock("./foo");
`;

		const result = transformCode(input);

		expect(result).toMatch(/jest\.dontMock\(script\.Parent\.foo\)/);
	});

	it("should not hoist jest.dontMock above import statements", () => {
		expect.assertions(1);

		const input = `
import { jest } from "@rbxts/jest-globals";
import { helper } from "./helper";
jest.dontMock("./foo");
`;

		const result = transformCode(input);
		const dontMockIndex = result.indexOf("dontMock");
		const helperImportIndex = result.indexOf('from "./helper"');

		expect(dontMockIndex).toBeGreaterThan(helperImportIndex);
	});
});
