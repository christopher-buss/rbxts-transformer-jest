import ts from "typescript";

import { collectLocalBindings, collectOuterReferences } from "./ast-utils.js";
import { ALLOWED_IDENTIFIERS, HOIST_METHODS, MOCK_PREFIX } from "./constants.js";

interface MockFactory {
	factory: ts.ArrowFunction | ts.FunctionExpression;
	modulePath: string | undefined;
}

export function collectFactoryMockRefs(
	hoisted: ReadonlyArray<ts.ExpressionStatement>,
): Set<string> {
	const refs = new Set<string>();
	for (const statement of hoisted) {
		for (const { factory } of collectMockFactories(statement)) {
			const local = collectLocalBindings(factory);
			for (const name of collectOuterReferences(factory, local)) {
				if (MOCK_PREFIX.test(name)) {
					refs.add(name);
				}
			}
		}
	}

	return refs;
}

export function validateFactory(statement: ts.ExpressionStatement): void {
	for (const { factory, modulePath } of collectMockFactories(statement)) {
		const localBindings = collectLocalBindings(factory);
		for (const name of collectOuterReferences(factory, localBindings)) {
			if (
				!ALLOWED_IDENTIFIERS.has(name) &&
				!MOCK_PREFIX.test(name) &&
				!/^(?:__)?cov/.test(name)
			) {
				const source = statement.getSourceFile().fileName;
				const { line } = statement
					.getSourceFile()
					.getLineAndCharacterOfPosition(statement.getStart());
				const location =
					modulePath !== undefined
						? `jest.mock(${modulePath}) at ${source}:${String(line + 1)}`
						: `jest.mock() at ${source}:${String(line + 1)}`;
				throw new Error(
					`[rbxts-jest-transformer] The module factory of \`${location}\` is not allowed to reference any out-of-scope variables.\n` +
						`Invalid variable access: ${name}\n` +
						"Allowed objects: expect, jest, Infinity, NaN, undefined.\n" +
						"Note: This is a precaution to guard against uninitialized mock variables. If it is ensured that the mock is required lazily, variable names prefixed with `mock` (case insensitive) are permitted.",
				);
			}
		}
	}
}

function collectMockFactories(statement: ts.ExpressionStatement): Array<MockFactory> {
	const factories: Array<MockFactory> = [];
	let node = statement.expression;

	// Walk the chain: jest.mock(...).unmock(...).mock(...)
	while (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		HOIST_METHODS.has(node.expression.name.text)
	) {
		if (node.expression.name.text === "mock") {
			const factory = node.arguments[1];
			if (factory && (ts.isFunctionExpression(factory) || ts.isArrowFunction(factory))) {
				const firstArgument = node.arguments[0];
				const modulePath =
					firstArgument && ts.isStringLiteral(firstArgument)
						? firstArgument.text
						: undefined;
				factories.push({ factory, modulePath });
			}
		}

		node = node.expression.expression;
	}

	return factories;
}
