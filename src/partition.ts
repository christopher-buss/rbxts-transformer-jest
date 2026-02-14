import ts from "typescript";

import { collectLocalBindings, collectOuterReferences } from "./ast-utils.js";
import { isJestModuleImport } from "./collect-jest-names.js";
import { HOIST_METHODS, JEST_GLOBAL_NAME, JEST_MODULE, MOCK_PREFIX } from "./constants.js";
import type { JestNames } from "./constants.js";
import { collectFactoryMockRefs, validateFactory } from "./factory-validation.js";

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

export interface BlockPartitionResult {
	readonly hoisted: Array<ts.Statement>;
	readonly hoistedVariables: Array<ts.VariableStatement>;
	readonly rest: Array<ts.Statement>;
}

export interface PartitionResult {
	readonly dependencyImports: Array<ts.Statement>;
	readonly hoisted: Array<ts.Statement>;
	readonly hoistedVariables: Array<ts.VariableStatement>;
	readonly jestImport: Array<ts.Statement>;
	readonly rest: Array<ts.Statement>;
}

export function partitionBlock(
	statements: ts.NodeArray<ts.Statement>,
	names: JestNames,
	sourceFile: ts.SourceFile,
): BlockPartitionResult | undefined {
	const hoisted: Array<ts.ExpressionStatement> = [];
	const rest: Array<ts.Statement> = [];
	for (const statement of statements) {
		if (isHoistableCall(statement, names)) {
			validateFactory(statement, sourceFile, EMPTY_SET);
			hoisted.push(statement);
		} else {
			rest.push(statement);
		}
	}

	if (hoisted.length === 0) {
		return undefined;
	}

	const factoryRefs = collectFactoryMockRefs(hoisted);
	const argumentRefs = collectCallArgumentMockRefs(hoisted);
	const allRefs = new Set([...argumentRefs, ...factoryRefs]);
	const { hoistedVariables, remaining } = extractMockPrefixVariables(rest, allRefs);

	return { hoisted, hoistedVariables, rest: remaining };
}

export function partitionStatements(
	statements: ts.NodeArray<ts.Statement>,
	names: JestNames,
	sourceFile: ts.SourceFile,
): PartitionResult {
	const mockTargets = collectMockTargetModules(statements, names);
	const importBindings = collectImportBindings(statements, mockTargets);
	const jestImport: Array<ts.Statement> = [];
	const hoisted: Array<ts.ExpressionStatement> = [];
	const rest: Array<ts.Statement> = [];
	for (const statement of statements) {
		if (isJestModuleImport(statement)) {
			jestImport.push(statement);
		} else if (isHoistableCall(statement, names)) {
			validateFactory(statement, sourceFile, importBindings);
			hoisted.push(statement);
		} else {
			rest.push(statement);
		}
	}

	const factoryRefs = collectFactoryMockRefs(hoisted);
	const argumentRefs = collectCallArgumentMockRefs(hoisted);
	const allRefs = new Set([...argumentRefs, ...factoryRefs]);
	const { hoistedVariables, remaining } = extractMockPrefixVariables(rest, allRefs);
	const depIds = collectHoistedIdentifiers(hoisted, hoistedVariables);
	const { dependencyImports, remaining: finalRest } = extractDependencyImports(remaining, depIds);

	return { dependencyImports, hoisted, hoistedVariables, jestImport, rest: finalRest };
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

function collectCallArgumentMockRefs(hoisted: ReadonlyArray<ts.ExpressionStatement>): Set<string> {
	const refs = new Set<string>();
	for (const statement of hoisted) {
		let node = statement.expression;
		while (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			HOIST_METHODS.has(node.expression.name.text)
		) {
			for (const argument of node.arguments) {
				if (ts.isIdentifier(argument) && MOCK_PREFIX.test(argument.text)) {
					refs.add(argument.text);
				}
			}

			node = node.expression.expression;
		}
	}

	return refs;
}

function collectDeclarationNames(name: ts.BindingName): ReadonlyArray<string> | undefined {
	if (ts.isIdentifier(name)) {
		return [name.text];
	}

	if (ts.isArrayBindingPattern(name)) {
		const names: Array<string> = [];
		for (const element of name.elements) {
			if (ts.isOmittedExpression(element)) {
				continue;
			}

			if (!ts.isIdentifier(element.name)) {
				return undefined;
			}

			names.push(element.name.text);
		}

		return names.length > 0 ? names : undefined;
	}

	return undefined;
}

function collectHoistedIdentifiers(
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

function collectImportBindings(
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

function collectMockTargetModules(
	statements: ts.NodeArray<ts.Statement>,
	names: JestNames,
): Set<string> {
	const targets = new Set<string>();
	for (const statement of statements) {
		if (!isHoistableCall(statement, names)) {
			continue;
		}

		let node = statement.expression;
		while (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			HOIST_METHODS.has(node.expression.name.text)
		) {
			for (const argument of node.arguments) {
				const value = unwrapStringLiteral(argument);
				if (value !== undefined) {
					targets.add(value);
				}
			}

			node = node.expression.expression;
		}
	}

	return targets;
}

function extractDependencyImports(
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

function extractMockPrefixVariables(
	rest: ReadonlyArray<ts.Statement>,
	factoryRefs: ReadonlySet<string>,
): { hoistedVariables: Array<ts.VariableStatement>; remaining: Array<ts.Statement> } {
	const hoistedVariables: Array<ts.VariableStatement> = [];
	const remaining: Array<ts.Statement> = [];
	for (const statement of rest) {
		if (
			ts.isVariableStatement(statement) &&
			(statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
			statement.declarationList.declarations.every((decl) => {
				const bound = collectDeclarationNames(decl.name);
				return (
					bound !== undefined &&
					bound.every((id) => MOCK_PREFIX.test(id)) &&
					bound.some((id) => factoryRefs.has(id))
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

function unwrapStringLiteral(node: ts.Expression): string | undefined {
	if (ts.isStringLiteral(node)) {
		return node.text;
	}

	if (ts.isAsExpression(node)) {
		return unwrapStringLiteral(node.expression);
	}

	return undefined;
}
