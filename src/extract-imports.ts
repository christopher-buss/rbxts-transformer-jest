import ts from "typescript";

import { collectLocalBindings, collectOuterReferences } from "./ast-utils.js";
import { HOIST_METHODS, JEST_MODULE } from "./constants.js";

export function collectHoistedIdentifiers(
	hoisted: ReadonlyArray<ts.ExpressionStatement>,
	hoistedVariables: ReadonlyArray<ts.Statement>,
	jsxFactoryIdentifier: string | undefined,
): Set<string> {
	const ids = new Set<string>();

	for (const statement of hoisted) {
		addCallArgumentReferences(statement, new Set<string>(), ids);
	}

	addDeclarationReferences(hoistedVariables, ids);

	if (
		jsxFactoryIdentifier !== undefined &&
		(factoriesContainJsx(hoisted) || statementsContainJsx(hoistedVariables))
	) {
		ids.add(jsxFactoryIdentifier);
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

function addDeclarationReferences(
	hoistedVariables: ReadonlyArray<ts.Statement>,
	out: Set<string>,
): void {
	const empty = new Set<string>();
	for (const statement of hoistedVariables) {
		const nodes: ReadonlyArray<ts.Node> = ts.isVariableStatement(statement)
			? statement.declarationList.declarations
			: [statement];
		for (const node of nodes) {
			for (const name of collectOuterReferences(node, empty)) {
				out.add(name);
			}
		}
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

function containsJsx(node: ts.Node): boolean {
	if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
		return true;
	}

	return ts.forEachChild(node, containsJsx) ?? false;
}

function factoriesContainJsx(hoisted: ReadonlyArray<ts.ExpressionStatement>): boolean {
	for (const statement of hoisted) {
		let node = statement.expression;
		while (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			HOIST_METHODS.has(node.expression.name.text)
		) {
			for (const argument of node.arguments) {
				if (
					(ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) &&
					containsJsx(argument)
				) {
					return true;
				}
			}

			node = node.expression.expression;
		}
	}

	return false;
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

function statementsContainJsx(statements: ReadonlyArray<ts.Statement>): boolean {
	return statements.some((statement) => containsJsx(statement));
}
