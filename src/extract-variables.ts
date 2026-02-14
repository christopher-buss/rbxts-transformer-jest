import ts from "typescript";

import { collectOuterReferences } from "./ast-utils.js";
import { HOIST_METHODS, MOCK_PREFIX } from "./constants.js";
import { collectFactoryMockRefs, collectFactoryOuterRefs } from "./factory-validation.js";

export function extractAllVariables(
	hoisted: ReadonlyArray<ts.ExpressionStatement>,
	rest: ReadonlyArray<ts.Statement>,
	pureConstants: ReadonlySet<string>,
): { hoistedVariables: Array<ts.VariableStatement>; remaining: Array<ts.Statement> } {
	const factoryRefs = collectFactoryMockRefs(hoisted);
	const argumentRefs = collectCallArgumentMockRefs(hoisted);
	const allMockRefs = new Set([...argumentRefs, ...factoryRefs]);
	const { hoistedVariables: mockVariables, remaining: afterMock } = extractMockPrefixVariables(
		rest,
		allMockRefs,
	);

	const allOuterRefs = collectFactoryOuterRefs(hoisted);
	const allArgumentRefs = collectCallArgumentIdentifiers(hoisted);
	const pureRefs = new Set(
		[...allOuterRefs, ...allArgumentRefs].filter((name) => pureConstants.has(name)),
	);
	const { hoistedVariables: pureVariables, remaining } = extractPureConstantVariables(
		afterMock,
		pureRefs,
		pureConstants,
	);

	return { hoistedVariables: [...mockVariables, ...pureVariables], remaining };
}

function collectCallArgumentIdentifiers(
	hoisted: ReadonlyArray<ts.ExpressionStatement>,
): Set<string> {
	const refs = new Set<string>();
	for (const statement of hoisted) {
		let node = statement.expression;
		while (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			HOIST_METHODS.has(node.expression.name.text)
		) {
			for (const argument of node.arguments) {
				if (ts.isIdentifier(argument)) {
					refs.add(argument.text);
				}
			}

			node = node.expression.expression;
		}
	}

	return refs;
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

function collectMockPrefixCandidate(
	statement: ts.Statement,
): undefined | { names: ReadonlyArray<string>; refs: Set<string> } {
	if (
		!ts.isVariableStatement(statement) ||
		(statement.declarationList.flags & ts.NodeFlags.Const) === 0
	) {
		return undefined;
	}

	const allNames: Array<string> = [];
	for (const decl of statement.declarationList.declarations) {
		const bound = collectDeclarationNames(decl.name);
		if (bound?.every((id) => MOCK_PREFIX.test(id)) !== true) {
			return undefined;
		}

		allNames.push(...bound);
	}

	const refs = collectOuterReferences(statement, new Set(allNames));

	return { names: allNames, refs };
}

function extractMockPrefixVariables(
	rest: ReadonlyArray<ts.Statement>,
	factoryRefs: ReadonlySet<string>,
): { hoistedVariables: Array<ts.VariableStatement>; remaining: Array<ts.Statement> } {
	const candidates = new Map<
		ts.VariableStatement,
		{ names: ReadonlyArray<string>; refs: Set<string> }
	>();
	for (const statement of rest) {
		const candidate = collectMockPrefixCandidate(statement);
		if (candidate !== undefined) {
			candidates.set(statement as ts.VariableStatement, candidate);
		}
	}

	const hoistNames = resolveTransitiveDeps(candidates, factoryRefs);

	const hoistedVariables: Array<ts.VariableStatement> = [];
	const remaining: Array<ts.Statement> = [];
	for (const statement of rest) {
		const entry = candidates.get(statement as ts.VariableStatement);
		if (entry?.names.some((id) => hoistNames.has(id)) === true) {
			hoistedVariables.push(statement as ts.VariableStatement);
		} else {
			remaining.push(statement);
		}
	}

	return { hoistedVariables, remaining };
}

function extractPureConstantVariables(
	rest: ReadonlyArray<ts.Statement>,
	pureRefs: ReadonlySet<string>,
	pureConstants: ReadonlySet<string>,
): { hoistedVariables: Array<ts.VariableStatement>; remaining: Array<ts.Statement> } {
	const hoistedVariables: Array<ts.VariableStatement> = [];
	const remaining: Array<ts.Statement> = [];

	for (const statement of rest) {
		if (
			ts.isVariableStatement(statement) &&
			(statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
			isPureConstantStatement(statement, pureConstants) &&
			hasReferencedDecl(statement, pureRefs)
		) {
			hoistedVariables.push(statement);
		} else {
			remaining.push(statement);
		}
	}

	return { hoistedVariables, remaining };
}

function hasReferencedDecl(statement: ts.VariableStatement, refs: ReadonlySet<string>): boolean {
	for (const decl of statement.declarationList.declarations) {
		if (ts.isIdentifier(decl.name) && refs.has(decl.name.text)) {
			return true;
		}
	}

	return false;
}

function isPureConstantStatement(
	statement: ts.VariableStatement,
	pureConstants: ReadonlySet<string>,
): boolean {
	return statement.declarationList.declarations.every(
		(decl) => ts.isIdentifier(decl.name) && pureConstants.has(decl.name.text),
	);
}

function resolveTransitiveDeps(
	candidates: ReadonlyMap<
		ts.VariableStatement,
		{ names: ReadonlyArray<string>; refs: Set<string> }
	>,
	factoryRefs: ReadonlySet<string>,
): Set<string> {
	const hoistNames = new Set(factoryRefs);
	let changed = true;
	while (changed) {
		changed = false;
		for (const [, { names, refs }] of candidates) {
			if (!names.some((id) => hoistNames.has(id))) {
				continue;
			}

			for (const ref of refs) {
				if (!hoistNames.has(ref)) {
					hoistNames.add(ref);
					changed = true;
				}
			}
		}
	}

	return hoistNames;
}
