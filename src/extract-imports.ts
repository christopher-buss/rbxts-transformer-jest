import ts from "typescript";

import { collectLocalBindings, collectOuterReferences } from "./ast-utils.js";
import { HOIST_METHODS, JEST_MODULE } from "./constants.js";

export function collectHoistedIdentifiers(
	hoisted: ReadonlyArray<ts.ExpressionStatement>,
	hoistedVariables: ReadonlyArray<ts.VariableStatement>,
): Set<string> {
	const ids = new Set<string>();
	const empty = new Set<string>();

	for (const statement of hoisted) {
		addCallArgumentReferences(statement, empty, ids);
	}

	// Walk the full declaration — collectOuterReferences skips
	// declaration names (decl.name) and type nodes automatically
	for (const statement of hoistedVariables) {
		for (const declaration of statement.declarationList.declarations) {
			for (const name of collectOuterReferences(declaration, empty)) {
				ids.add(name);
			}
		}
	}

	return ids;
}

export function collectImportBindings(
	statements: ts.NodeArray<ts.Statement>,
	excludedSpecifiers: ReadonlySet<string>,
): Set<string> {
	const bindings = new Set<string>();
	for (const statement of statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
			continue;
		}

		const specifier = statement.moduleSpecifier.text;
		if (specifier === JEST_MODULE || excludedSpecifiers.has(specifier)) {
			continue;
		}

		addImportClauseBindings(statement.importClause, bindings);
	}

	return bindings;
}

export function extractDependencyImports(
	rest: ReadonlyArray<ts.Statement>,
	identifiers: ReadonlySet<string>,
): { dependencyImports: Array<ts.Statement>; remaining: Array<ts.Statement> } {
	const dependencyImports: Array<ts.Statement> = [];
	const remaining: Array<ts.Statement> = [];

	for (const statement of rest) {
		if (ts.isImportDeclaration(statement) && importBindsAny(statement, identifiers)) {
			dependencyImports.push(statement);
		} else {
			remaining.push(statement);
		}
	}

	return { dependencyImports, remaining };
}

function addCallArgumentReferences(
	statement: ts.ExpressionStatement,
	localBindings: Set<string>,
	out: Set<string>,
): void {
	let node = statement.expression;
	while (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		HOIST_METHODS.has(node.expression.name.text)
	) {
		for (const argument of node.arguments) {
			// For factory functions, compute their own local bindings so inner
			// declarations (const actual = ...) are excluded from outer refs.
			const bindings =
				ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)
					? collectLocalBindings(argument)
					: localBindings;
			for (const name of collectOuterReferences(argument, bindings)) {
				out.add(name);
			}
		}

		node = node.expression.expression;
	}
}

function addImportClauseBindings(
	importClause: ts.ImportClause | undefined,
	out: Set<string>,
): void {
	if (!importClause) {
		return;
	}

	if (importClause.name) {
		out.add(importClause.name.text);
	}

	const { namedBindings } = importClause;
	if (!namedBindings) {
		return;
	}

	if (ts.isNamespaceImport(namedBindings)) {
		out.add(namedBindings.name.text);
	} else {
		for (const element of namedBindings.elements) {
			out.add(element.name.text);
		}
	}
}

function importBindsAny(
	declaration: ts.ImportDeclaration,
	identifiers: ReadonlySet<string>,
): boolean {
	const { importClause } = declaration;
	if (!importClause) {
		return false;
	}

	if (importClause.name && identifiers.has(importClause.name.text)) {
		return true;
	}

	const { namedBindings } = importClause;
	if (!namedBindings) {
		return false;
	}

	if (ts.isNamespaceImport(namedBindings)) {
		return identifiers.has(namedBindings.name.text);
	}

	return namedBindings.elements.some((element) => identifiers.has(element.name.text));
}
