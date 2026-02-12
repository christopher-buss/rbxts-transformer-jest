import ts from "typescript";

const HOIST_METHODS = new Set(["mock", "unmock"]);
const JEST_MODULE = "@rbxts/jest-globals";

export function transformer(): ts.TransformerFactory<ts.SourceFile> {
	return () => {
		return (sourceFile) => {
			const jestImport: Array<ts.Statement> = [];
			const hoisted: Array<ts.Statement> = [];
			const rest: Array<ts.Statement> = [];

			for (const stmt of sourceFile.statements) {
				if (isJestGlobalImport(stmt)) {
					jestImport.push(stmt);
				} else if (isHoistableCall(stmt)) {
					hoisted.push(stmt);
				} else {
					rest.push(stmt);
				}
			}

			return ts.factory.updateSourceFile(sourceFile, [...jestImport, ...hoisted, ...rest]);
		};
	};
}

function isHoistableCall(node: ts.Node): boolean {
	if (!ts.isExpressionStatement(node)) {
		return false;
	}

	const expr = node.expression;
	if (!ts.isCallExpression(expr)) {
		return false;
	}

	const callee = expr.expression;
	if (!ts.isPropertyAccessExpression(callee)) {
		return false;
	}

	return (
		ts.isIdentifier(callee.expression) &&
		callee.expression.text === "jest" &&
		HOIST_METHODS.has(callee.name.text)
	);
}

function isJestGlobalImport(node: ts.Node): node is ts.ImportDeclaration {
	return (
		ts.isImportDeclaration(node) &&
		ts.isStringLiteral(node.moduleSpecifier) &&
		node.moduleSpecifier.text === JEST_MODULE
	);
}
