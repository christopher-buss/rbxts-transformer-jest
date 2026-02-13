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
			const { hoisted, jestImport, rest } = partitionStatements(sourceFile.statements, names);

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

	for (const stmt of statements) {
		if (!isJestGlobalImport(stmt)) {
			continue;
		}

		const binding = extractJestBinding(stmt);
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

	for (const stmt of statements) {
		if (isJestGlobalImport(stmt)) {
			jestImport.push(stmt);
		} else if (isHoistableCall(stmt, names)) {
			hoisted.push(stmt);
		} else {
			rest.push(stmt);
		}
	}

	return { hoisted, jestImport, rest };
}
