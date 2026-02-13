import ts from "typescript";

const HOIST_METHODS = new Set(["mock", "unmock"]);
const JEST_MODULE = "@rbxts/jest-globals";
const JEST_GLOBAL_NAME = "jest";
const ALLOWED_IDENTIFIERS = new Set(["expect", "Infinity", "jest", "NaN", "undefined"]);

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
	readonly jestImport: Array<ts.Statement>;
	readonly rest: Array<ts.Statement>;
}

export function transformer(): ts.TransformerFactory<ts.SourceFile> {
	return (context) => {
		return (sourceFile) => {
			const names = collectJestNames(sourceFile.statements);
			const shadowed = collectShadowedNames(sourceFile.statements, names);
			const filtered = filterShadowed(names, shadowed);
			const { hoisted, jestImport, rest } = partitionStatements(
				sourceFile.statements,
				filtered,
			);

			return context.factory.updateSourceFile(sourceFile, [
				...jestImport,
				...hoisted,
				...rest,
			]);
		};
	};
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
		if (ts.isVariableDeclaration(child) && ts.isIdentifier(child.name)) {
			bindings.add(child.name.text);
		} else if (ts.isBindingElement(child) && ts.isIdentifier(child.name)) {
			bindings.add(child.name.text);
		} else if (ts.isParameter(child) && ts.isIdentifier(child.name)) {
			bindings.add(child.name.text);
		} else if (ts.isFunctionDeclaration(child) && child.name) {
			bindings.add(child.name.text);
		} else if (
			ts.isCatchClause(child) &&
			child.variableDeclaration &&
			ts.isIdentifier(child.variableDeclaration.name)
		) {
			bindings.add(child.variableDeclaration.name.text);
		}

		ts.forEachChild(child, walk);
	}

	ts.forEachChild(node, walk);
	return bindings;
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

function filterShadowed(names: JestNames, shadowed: Set<string>): JestNames {
	if (shadowed.size === 0) {
		return names;
	}

	return {
		namespaces: new Set([...names.namespaces].filter((name) => !shadowed.has(name))),
		tracked: new Set([...names.tracked].filter((name) => !shadowed.has(name))),
	};
}

function isAllowedOuterReference(name: string): boolean {
	return ALLOWED_IDENTIFIERS.has(name) || /^mock/i.test(name) || /^(?:__)?cov/.test(name);
}

function isHoistableCall(node: ts.Node, names: JestNames): boolean {
	if (!ts.isExpressionStatement(node)) {
		return false;
	}

	const expr = node.expression;
	if (!ts.isCallExpression(expr)) {
		return false;
	}

	const callee = expr.expression;
	if (!ts.isPropertyAccessExpression(callee) || !HOIST_METHODS.has(callee.name.text)) {
		return false;
	}

	return isJestCallee(callee.expression, names);
}

function isJestCallee(node: ts.Expression, { namespaces, tracked }: JestNames): boolean {
	// roblox-ts has no global jest — only identifiers tracked from
	// an @rbxts/jest-globals import binding are recognized.
	if (ts.isIdentifier(node)) {
		return tracked.has(node.text);
	}

	return (
		ts.isPropertyAccessExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.name.text === JEST_GLOBAL_NAME &&
		namespaces.has(node.expression.text)
	);
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

	if (ts.isVariableDeclaration(parent) && parent.name === node) {
		return false;
	}

	if (ts.isParameter(parent) && parent.name === node) {
		return false;
	}

	if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
		return false;
	}

	if (ts.isPropertyAssignment(parent) && parent.name === node) {
		return false;
	}

	if (ts.isFunctionDeclaration(parent) && parent.name === node) {
		return false;
	}

	if (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node)) {
		return false;
	}

	return true;
}

function partitionStatements(
	statements: ts.NodeArray<ts.Statement>,
	names: JestNames,
): PartitionResult {
	const jestImport: Array<ts.Statement> = [];
	const hoisted: Array<ts.Statement> = [];
	const rest: Array<ts.Statement> = [];

	for (const statement of statements) {
		if (isJestGlobalImport(statement)) {
			jestImport.push(statement);
		} else if (isHoistableCall(statement, names)) {
			validateFactory(statement as ts.ExpressionStatement);
			hoisted.push(statement);
		} else {
			rest.push(statement);
		}
	}

	return { hoisted, jestImport, rest };
}

function validateFactory(statement: ts.ExpressionStatement): void {
	const call = statement.expression as ts.CallExpression;
	const callee = call.expression as ts.PropertyAccessExpression;

	if (callee.name.text !== "mock") {
		return;
	}

	const factory = call.arguments[1];
	if (!factory) {
		return;
	}

	if (!ts.isFunctionExpression(factory) && !ts.isArrowFunction(factory)) {
		return;
	}

	const localBindings = collectLocalBindings(factory);
	const outerRefs = collectOuterReferences(factory, localBindings);

	for (const name of outerRefs) {
		if (!isAllowedOuterReference(name)) {
			throw new Error(
				"The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.\n" +
					`Invalid variable access: ${name}\n` +
					"Allowed objects: expect, jest, Infinity, NaN, undefined.\n" +
					"Note: This is a precaution to guard against uninitialized mock variables. If it is ensured that the mock is required lazily, variable names prefixed with `mock` (case insensitive) are permitted.",
			);
		}
	}
}
