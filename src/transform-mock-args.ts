import ts from "typescript";

import { HOIST_METHODS } from "./constants.js";
import { resolveRelativeModulePath } from "./resolve-module-path.js";
import type { PackageResolver } from "./resolve-package-path.js";
import { resolvePackagePath } from "./resolve-package-path.js";

interface InnerChainContext {
	readonly args: ReadonlyArray<ts.Expression> | ts.NodeArray<ts.Expression>;
	readonly containingFile: string | undefined;
	readonly resolver: PackageResolver | undefined;
}

export function transformMockArguments(
	factory: ts.NodeFactory,
	statements: Array<ts.Statement>,
	resolver?: PackageResolver,
	containingFile?: string,
): Array<ts.Statement> {
	return statements.map((statement) => {
		return transformStatement(factory, statement, resolver, containingFile);
	});
}

function transformCallChain(
	factory: ts.NodeFactory,
	node: ts.CallExpression,
	resolver: PackageResolver | undefined,
	containingFile: string | undefined,
): ts.CallExpression {
	const args = transformFirstArgument(factory, node, resolver, containingFile);
	const chained = transformInnerChain(factory, node, { args, containingFile, resolver });
	if (chained !== undefined) {
		return chained;
	}

	if (args !== node.arguments) {
		return factory.updateCallExpression(node, node.expression, node.typeArguments, args);
	}

	return node;
}

function transformFirstArgument(
	factory: ts.NodeFactory,
	node: ts.CallExpression,
	resolver: PackageResolver | undefined,
	containingFile: string | undefined,
): ReadonlyArray<ts.Expression> | ts.NodeArray<ts.Expression> {
	const firstArgument = node.arguments[0];
	if (firstArgument === undefined) {
		return node.arguments;
	}

	if (!ts.isStringLiteral(firstArgument)) {
		return node.arguments;
	}

	const resolved =
		resolveRelativeModulePath(factory, firstArgument.text) ??
		(resolver !== undefined && containingFile !== undefined
			? resolvePackagePath(factory, firstArgument.text, containingFile, resolver)
			: undefined);

	if (resolved === undefined) {
		return node.arguments;
	}

	return [resolved, ...node.arguments.slice(1)];
}

function transformInnerChain(
	factory: ts.NodeFactory,
	node: ts.CallExpression,
	context: InnerChainContext,
): ts.CallExpression | undefined {
	if (
		!ts.isPropertyAccessExpression(node.expression) ||
		!HOIST_METHODS.has(node.expression.name.text) ||
		!ts.isCallExpression(node.expression.expression)
	) {
		return undefined;
	}

	const inner = transformCallChain(
		factory,
		node.expression.expression,
		context.resolver,
		context.containingFile,
	);
	if (inner === node.expression.expression && context.args === node.arguments) {
		return undefined;
	}

	const callee = factory.updatePropertyAccessExpression(
		node.expression,
		inner,
		node.expression.name,
	);

	return factory.updateCallExpression(node, callee, node.typeArguments, context.args);
}

function transformStatement(
	factory: ts.NodeFactory,
	statement: ts.Statement,
	resolver: PackageResolver | undefined,
	containingFile: string | undefined,
): ts.Statement {
	if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
		return statement;
	}

	const transformed = transformCallChain(factory, statement.expression, resolver, containingFile);
	if (transformed === statement.expression) {
		return statement;
	}

	return factory.updateExpressionStatement(statement, transformed);
}
