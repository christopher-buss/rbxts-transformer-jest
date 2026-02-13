import ts from "typescript";

import { isJestModuleImport } from "./collect-jest-names.js";
import { HOIST_METHODS, JEST_GLOBAL_NAME, MOCK_PREFIX } from "./constants.js";
import type { JestNames } from "./constants.js";
import { collectFactoryMockRefs, validateFactory } from "./factory-validation.js";

export interface BlockPartitionResult {
	readonly hoisted: Array<ts.Statement>;
	readonly hoistedVariables: Array<ts.Statement>;
	readonly rest: Array<ts.Statement>;
}

export interface PartitionResult {
	readonly hoisted: Array<ts.Statement>;
	readonly hoistedVariables: Array<ts.Statement>;
	readonly jestImport: Array<ts.Statement>;
	readonly rest: Array<ts.Statement>;
}

export function partitionBlock(
	statements: ts.NodeArray<ts.Statement>,
	names: JestNames,
): BlockPartitionResult | undefined {
	const hoisted: Array<ts.ExpressionStatement> = [];
	const rest: Array<ts.Statement> = [];
	for (const statement of statements) {
		if (isHoistableCall(statement, names)) {
			validateFactory(statement);
			hoisted.push(statement);
		} else {
			rest.push(statement);
		}
	}

	if (hoisted.length === 0) {
		return undefined;
	}

	const factoryRefs = collectFactoryMockRefs(hoisted);
	const { hoistedVariables, remaining } = extractMockPrefixVariables(rest, factoryRefs);

	return { hoisted, hoistedVariables, rest: remaining };
}

export function partitionStatements(
	statements: ts.NodeArray<ts.Statement>,
	names: JestNames,
): PartitionResult {
	const jestImport: Array<ts.Statement> = [];
	const hoisted: Array<ts.ExpressionStatement> = [];
	const rest: Array<ts.Statement> = [];
	for (const statement of statements) {
		if (isJestModuleImport(statement)) {
			jestImport.push(statement);
		} else if (isHoistableCall(statement, names)) {
			validateFactory(statement);
			hoisted.push(statement);
		} else {
			rest.push(statement);
		}
	}

	const factoryRefs = collectFactoryMockRefs(hoisted);
	const { hoistedVariables, remaining } = extractMockPrefixVariables(rest, factoryRefs);

	return { hoisted, hoistedVariables, jestImport, rest: remaining };
}

function extractMockPrefixVariables(
	rest: ReadonlyArray<ts.Statement>,
	factoryRefs: ReadonlySet<string>,
): { hoistedVariables: Array<ts.Statement>; remaining: Array<ts.Statement> } {
	const hoistedVariables: Array<ts.Statement> = [];
	const remaining: Array<ts.Statement> = [];
	for (const statement of rest) {
		if (
			ts.isVariableStatement(statement) &&
			(statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
			statement.declarationList.declarations.every((decl) => {
				return (
					ts.isIdentifier(decl.name) &&
					MOCK_PREFIX.test(decl.name.text) &&
					factoryRefs.has(decl.name.text)
				);
			})
		) {
			hoistedVariables.push(statement);
		} else {
			remaining.push(statement);
		}
	}

	return { hoistedVariables, remaining };
}

function isHoistableCall(
	node: ts.Node,
	names: JestNames,
): node is ts.CallExpression | ts.ExpressionStatement {
	if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) {
		return false;
	}

	const { expression: callee } = node.expression;

	return (
		ts.isPropertyAccessExpression(callee) &&
		HOIST_METHODS.has(callee.name.text) &&
		isJestCallee(callee.expression, names)
	);
}

function isJestCallee(node: ts.Expression, names: JestNames): boolean {
	if (ts.isIdentifier(node)) {
		return names.tracked.has(node.text);
	}

	if (
		ts.isPropertyAccessExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.name.text === JEST_GLOBAL_NAME &&
		names.namespaces.has(node.expression.text)
	) {
		return true;
	}

	// Chained calls: jest.mock('./a').unmock('./b')
	if (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		HOIST_METHODS.has(node.expression.name.text)
	) {
		return isJestCallee(node.expression.expression, names);
	}

	return false;
}
