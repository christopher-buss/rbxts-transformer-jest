/* eslint-disable max-lines -- TODO: Refactor to reduce complexity */
import ts from "typescript";

const HOIST_METHODS = new Set(["mock", "unmock"]);
const JEST_MODULE = "@rbxts/jest-globals";
const JEST_GLOBAL_NAME = "jest";
const ALLOWED_IDENTIFIERS = new Set(["expect", "Infinity", "jest", "NaN", "undefined"]);
const MOCK_PREFIX = /^mock/i;

interface JestBinding {
	readonly name: string;
	readonly isNamespace: boolean;
}

interface JestNames {
	readonly namespaces: ReadonlySet<string>;
	readonly tracked: ReadonlySet<string>;
}

interface PartitionResult {
	readonly hoisted: Array<ts.Statement>;
	readonly hoistedVariables: Array<ts.Statement>;
	readonly jestImport: Array<ts.Statement>;
	readonly rest: Array<ts.Statement>;
}

export function transformer(): ts.TransformerFactory<ts.SourceFile> {
	return (context) => {
		return (sourceFile) => {
			const names = collectJestNames(sourceFile.statements);
			const shadowed = collectShadowedNames(sourceFile.statements, names);
			const filtered = filterShadowed(names, shadowed);
			const { hoisted, hoistedVariables, jestImport, rest } = partitionStatements(
				sourceFile.statements,
				filtered,
			);

			return context.factory.updateSourceFile(sourceFile, [
				...jestImport,
				...hoistedVariables,
				...hoisted,
				...rest,
			]);
		};
	};
}

function collectFactoryMockRefs(hoisted: ReadonlyArray<ts.ExpressionStatement>): Set<string> {
	const refs = new Set<string>();
	for (const statement of hoisted) {
		for (const factory of collectMockFactories(statement)) {
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

function collectJestNames(statements: ts.NodeArray<ts.Statement>): JestNames {
	const tracked = new Set<string>();
	const namespaces = new Set<string>();
	for (const statement of statements) {
		if (!isJestGlobalImport(statement)) {
			continue;
		}

		const binding = extractJestBinding(statement);
		if (binding === undefined) {
			continue;
		}

		if (binding.isNamespace) {
			namespaces.add(binding.name);
		} else {
			tracked.add(binding.name);
		}
	}

	return { namespaces, tracked };
}

function collectLocalBindings(node: ts.Node): Set<string> {
	const bindings = new Set<string>();
	function walk(child: ts.Node): void {
		const name = getBindingName(child);
		if (name !== undefined) {
			bindings.add(name);
		}

		ts.forEachChild(child, walk);
	}

	ts.forEachChild(node, walk);

	return bindings;
}

function collectMockFactories(
	statement: ts.ExpressionStatement,
): Array<ts.ArrowFunction | ts.FunctionExpression> {
	const factories: Array<ts.ArrowFunction | ts.FunctionExpression> = [];
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
				factories.push(factory);
			}
		}

		node = node.expression.expression;
	}

	return factories;
}

function collectOuterReferences(factory: ts.Node, localBindings: Set<string>): Set<string> {
	const outer = new Set<string>();
	function walk(child: ts.Node): void {
		if (
			ts.isIdentifier(child) &&
			isReferencePosition(child) &&
			!localBindings.has(child.text)
		) {
			outer.add(child.text);
		}

		ts.forEachChild(child, walk);
	}

	ts.forEachChild(factory, walk);

	return outer;
}

function collectShadowedNames(
	statements: ts.NodeArray<ts.Statement>,
	{ namespaces, tracked }: JestNames,
): Set<string> {
	const allTracked = new Set([...namespaces, ...tracked]);
	const shadowed = new Set<string>();
	for (const statement of statements) {
		if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (ts.isIdentifier(declaration.name) && allTracked.has(declaration.name.text)) {
					shadowed.add(declaration.name.text);
				}
			}
		} else if (
			ts.isFunctionDeclaration(statement) &&
			statement.name &&
			allTracked.has(statement.name.text)
		) {
			shadowed.add(statement.name.text);
		}
	}

	return shadowed;
}

function extractJestBinding(node: ts.ImportDeclaration): JestBinding | undefined {
	const bindings = node.importClause?.namedBindings;
	if (!bindings) {
		return undefined;
	}

	if (ts.isNamespaceImport(bindings)) {
		return { name: bindings.name.text, isNamespace: true };
	}

	const jestElement = bindings.elements.find((element) => {
		return (
			element.propertyName?.text === JEST_GLOBAL_NAME ||
			element.name.text === JEST_GLOBAL_NAME
		);
	});

	return jestElement ? { name: jestElement.name.text, isNamespace: false } : undefined;
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

function filterShadowed(names: JestNames, shadowed: Set<string>): JestNames {
	if (shadowed.size === 0) {
		return names;
	}

	return {
		namespaces: new Set([...names.namespaces].filter((name) => !shadowed.has(name))),
		tracked: new Set([...names.tracked].filter((name) => !shadowed.has(name))),
	};
}

function getBindingName(node: ts.Node): string | undefined {
	if (
		(ts.isVariableDeclaration(node) || ts.isBindingElement(node) || ts.isParameter(node)) &&
		ts.isIdentifier(node.name)
	) {
		return node.name.text;
	}

	if (ts.isFunctionDeclaration(node) && node.name) {
		return node.name.text;
	}

	if (
		ts.isCatchClause(node) &&
		node.variableDeclaration &&
		ts.isIdentifier(node.variableDeclaration.name)
	) {
		return node.variableDeclaration.name.text;
	}

	return undefined;
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

function isJestGlobalImport(node: ts.Node): node is ts.ImportDeclaration {
	return (
		ts.isImportDeclaration(node) &&
		ts.isStringLiteral(node.moduleSpecifier) &&
		node.moduleSpecifier.text === JEST_MODULE
	);
}

function isReferencePosition(node: ts.Identifier): boolean {
	const { parent } = node;
	if (ts.isBindingElement(parent)) {
		return parent.name !== node && parent.propertyName !== node;
	}

	const isDeclarationName =
		((ts.isVariableDeclaration(parent) || ts.isParameter(parent)) && parent.name === node) ||
		((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) &&
			parent.name === node) ||
		(ts.isFunctionDeclaration(parent) && parent.name === node);

	return !isDeclarationName;
}

function partitionStatements(
	statements: ts.NodeArray<ts.Statement>,
	names: JestNames,
): PartitionResult {
	const jestImport: Array<ts.Statement> = [];
	const hoisted: Array<ts.ExpressionStatement> = [];
	const rest: Array<ts.Statement> = [];
	for (const statement of statements) {
		if (isJestGlobalImport(statement)) {
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

function validateFactory(statement: ts.ExpressionStatement): void {
	for (const factory of collectMockFactories(statement)) {
		const localBindings = collectLocalBindings(factory);
		for (const name of collectOuterReferences(factory, localBindings)) {
			if (
				!ALLOWED_IDENTIFIERS.has(name) &&
				!MOCK_PREFIX.test(name) &&
				!/^(?:__)?cov/.test(name)
			) {
				throw new Error(
					"The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.\n" +
						`Invalid variable access: ${name}\n` +
						"Allowed objects: expect, jest, Infinity, NaN, undefined.\n" +
						"Note: This is a precaution to guard against uninitialized mock variables. If it is ensured that the mock is required lazily, variable names prefixed with `mock` (case insensitive) are permitted.",
				);
			}
		}
	}
}
