import ts from "typescript";

const HOIST_METHODS = new Set(["mock", "unmock"]);
const JEST_MODULE = "@rbxts/jest-globals";
const JEST_GLOBAL_NAME = "jest";

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
			hoisted.push(statement);
		} else {
			rest.push(statement);
		}
	}

	return { hoisted, jestImport, rest };
}
