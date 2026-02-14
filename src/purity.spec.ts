import ts from "typescript";
import { describe, expect, it } from "vitest";

import { collectPureConstants, isPureExpression } from "./purity.js";

function parseExpression(code: string): ts.Expression {
	const source = ts.createSourceFile(
		"test.ts",
		`const _ = ${code};`,
		ts.ScriptTarget.ESNext,
		true,
	);
	const statement = source.statements[0];
	if (!statement || !ts.isVariableStatement(statement)) {
		throw new Error("Expected variable statement");
	}

	const decl = statement.declarationList.declarations[0];
	if (!decl?.initializer) {
		throw new Error("Expected initializer");
	}

	return decl.initializer;
}

function parsePostfixExpression(): ts.Expression {
	const source = ts.createSourceFile("test.ts", "let x = 0; x++;", ts.ScriptTarget.ESNext, true);
	const stmt = source.statements[1];
	if (!stmt || !ts.isExpressionStatement(stmt)) {
		throw new Error("Expected expression statement");
	}

	return stmt.expression;
}

describe(isPureExpression, () => {
	describe("pure literals", () => {
		it.for(["42", '"hello"', "true", "false", "null", "1n", "/abc/g", "`hello`"])(
			"should treat %s as pure",
			(code) => {
				expect.assertions(1);
				expect(isPureExpression(parseExpression(code))).toBe(true);
			},
		);
	});

	it("should treat identifiers as NOT pure", () => {
		expect.assertions(1);
		expect(isPureExpression(parseExpression("foo"))).toBe(false);
	});

	it("should treat calls as NOT pure", () => {
		expect.assertions(1);
		expect(isPureExpression(parseExpression("fn()"))).toBe(false);
	});

	describe("prefix unary", () => {
		it.for(["-1", "+1", "~0", "!true"])("should treat %s as pure", (code) => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression(code))).toBe(true);
		});

		it("should treat prefix unary on impure as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("-foo"))).toBe(false);
		});
	});

	it("should treat void on pure as pure", () => {
		expect.assertions(1);
		expect(isPureExpression(parseExpression("void 0"))).toBe(true);
	});

	it("should treat void on impure as NOT pure", () => {
		expect.assertions(1);
		expect(isPureExpression(parseExpression("void fn()"))).toBe(false);
	});

	describe("binary expressions", () => {
		it("should treat binary on pure operands as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("1 + 2"))).toBe(true);
		});

		it("should treat binary with impure operand as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("1 + foo"))).toBe(false);
		});
	});

	it("should treat template expression with pure spans as pure", () => {
		expect.assertions(1);
		// eslint-disable-next-line no-template-curly-in-string -- testing template expressions
		expect(isPureExpression(parseExpression("`x${1}y${2}`"))).toBe(true);
	});

	it("should treat template expression with impure span as NOT pure", () => {
		expect.assertions(1);
		// eslint-disable-next-line no-template-curly-in-string -- testing template expressions
		expect(isPureExpression(parseExpression("`x${foo}y`"))).toBe(false);
	});

	describe("array literals", () => {
		it("should treat array with pure elements as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("[1, 2, 3]"))).toBe(true);
		});

		it("should treat array with impure element as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("[1, foo, 3]"))).toBe(false);
		});

		it("should treat spread of pure operand as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("[...[1, 2]]"))).toBe(true);
		});

		it("should treat spread of impure operand as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("[...foo]"))).toBe(false);
		});
	});

	describe("object literals", () => {
		it("should treat object with pure property values as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("{ a: 1, b: 2 }"))).toBe(true);
		});

		it("should treat object with impure value as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("{ a: foo }"))).toBe(false);
		});

		it("should treat shorthand property as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("{ x }"))).toBe(false);
		});

		it("should treat computed key with pure expression as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("{ [1 + 2]: 42 }"))).toBe(true);
		});

		it("should treat computed key with impure expression as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("{ [foo]: 42 }"))).toBe(false);
		});

		it("should treat spread of pure operand as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("{ ...{ a: 1 } }"))).toBe(true);
		});

		it("should treat spread of impure operand as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("{ ...foo }"))).toBe(false);
		});

		it("should treat method declaration as pure (closure creation)", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("{ m() {} }"))).toBe(true);
		});

		it("should treat accessor declaration as pure (closure creation)", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("{ get x() { return 1; } }"))).toBe(true);
		});
	});

	describe("functions", () => {
		it("should treat arrow function as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("() => 42"))).toBe(true);
		});

		it("should treat function expression as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("function() { return 1; }"))).toBe(true);
		});
	});

	it("should treat conditional with pure parts as pure", () => {
		expect.assertions(1);
		expect(isPureExpression(parseExpression("true ? 1 : 2"))).toBe(true);
	});

	it("should treat conditional with impure part as NOT pure", () => {
		expect.assertions(1);
		expect(isPureExpression(parseExpression("true ? foo : 2"))).toBe(false);
	});

	describe("wrapper expressions", () => {
		it("should treat parenthesized pure as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("(42)"))).toBe(true);
		});

		it("should treat as-expression with pure inner as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("[1] as const"))).toBe(true);
		});

		it("should treat satisfies-expression with pure inner as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("42 satisfies number"))).toBe(true);
		});

		it("should treat non-null assertion with pure inner as pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("42!"))).toBe(true);
		});
	});

	describe("not pure", () => {
		it("should treat new expression as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("new Foo()"))).toBe(false);
		});

		it("should treat property access as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("a.b"))).toBe(false);
		});

		it("should treat element access as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("a[0]"))).toBe(false);
		});

		it("should treat await as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("await x"))).toBe(false);
		});

		it("should treat tagged template as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("tag`hello`"))).toBe(false);
		});

		it("should treat delete as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("delete obj.x"))).toBe(false);
		});

		it("should treat postfix unary as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parsePostfixExpression())).toBe(false);
		});

		it("should treat typeof as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("typeof x"))).toBe(false);
		});

		it("should treat class expression as NOT pure", () => {
			expect.assertions(1);
			expect(isPureExpression(parseExpression("class {}"))).toBe(false);
		});
	});
});

function parseStatements(code: string): ts.NodeArray<ts.Statement> {
	return ts.createSourceFile("test.ts", code, ts.ScriptTarget.ESNext, true).statements;
}

describe(collectPureConstants, () => {
	it("should find const with pure initializer", () => {
		expect.assertions(1);

		const result = collectPureConstants(parseStatements("const X = 42;"));

		expect(result).toStrictEqual(new Set(["X"]));
	});

	it("should skip let declarations", () => {
		expect.assertions(1);

		const result = collectPureConstants(parseStatements("let X = 42;"));

		expect(result.size).toBe(0);
	});

	it("should skip var declarations", () => {
		expect.assertions(1);

		const result = collectPureConstants(parseStatements("var X = 42;"));

		expect(result.size).toBe(0);
	});

	it("should skip const without initializer", () => {
		expect.assertions(1);

		// declare const X: number; — has no initializer
		const result = collectPureConstants(parseStatements("declare const X: number;"));

		expect(result.size).toBe(0);
	});

	it("should skip const with impure initializer", () => {
		expect.assertions(1);

		const result = collectPureConstants(parseStatements("const X = fn();"));

		expect(result.size).toBe(0);
	});

	it("should skip destructuring patterns", () => {
		expect.assertions(1);

		const result = collectPureConstants(parseStatements("const { a } = { a: 1 };"));

		expect(result.size).toBe(0);
	});

	it("should collect individual names from multi-decl statement", () => {
		expect.assertions(1);

		const result = collectPureConstants(parseStatements("const A = 1, B = 2;"));

		expect(result).toStrictEqual(new Set(["A", "B"]));
	});

	it("should skip individual impure decls in multi-decl statement", () => {
		expect.assertions(1);

		const result = collectPureConstants(parseStatements("const A = 1, B = fn();"));

		expect(result).toStrictEqual(new Set(["A"]));
	});

	it("should collect from multiple statements", () => {
		expect.assertions(1);

		const result = collectPureConstants(parseStatements("const X = 1;\nconst Y = 'hello';"));

		expect(result).toStrictEqual(new Set(["X", "Y"]));
	});

	it("should skip non-variable statements", () => {
		expect.assertions(1);

		const result = collectPureConstants(parseStatements("function foo() {}"));

		expect(result.size).toBe(0);
	});
});
