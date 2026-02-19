import ts from "typescript";

import { HOIST_METHODS } from "./constants.js";
import { resolveRelativeModulePath } from "./resolve-module-path.js";

export function transformMockArguments(
	factory: ts.NodeFactory,
	statements: Array<ts.Statement>,
): Array<ts.Statement> {
	return statements.map((statement) => transformStatement(factory, statement));
}

function transformCallChain(factory: ts.NodeFactory, node: ts.CallExpression): ts.CallExpression {
	const args = transformFirstArgument(factory, node);

	if (
		ts.isPropertyAccessExpression(node.expression) &&
		HOIST_METHODS.has(node.expression.name.text) &&
		ts.isCallExpression(node.expression.expression)
	) {
		const inner = transformCallChain(factory, node.expression.expression);
		if (inner !== node.expression.expression || args !== node.arguments) {
			const callee = factory.updatePropertyAccessExpression(
				node.expression,
				inner,
				node.expression.name,
			);

			return factory.updateCallExpression(node, callee, node.typeArguments, args);
		}
	}

	if (args !== node.arguments) {
		return factory.updateCallExpression(node, node.expression, node.typeArguments, args);
	}

	return node;
}

function transformFirstArgument(
	factory: ts.NodeFactory,
	node: ts.CallExpression,
): ReadonlyArray<ts.Expression> | ts.NodeArray<ts.Expression> {
	const firstArgument = node.arguments[0];
	if (firstArgument === undefined) {
		return node.arguments;
	}

	if (!ts.isStringLiteral(firstArgument)) {
		return node.arguments;
	}

	const resolved = resolveRelativeModulePath(factory, firstArgument.text);
	if (resolved === undefined) {
		return node.arguments;
	}

	return [resolved, ...node.arguments.slice(1)];
}

function transformStatement(factory: ts.NodeFactory, statement: ts.Statement): ts.Statement {
	if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
		return statement;
	}

	const transformed = transformCallChain(factory, statement.expression);
	if (transformed === statement.expression) {
		return statement;
	}

	return factory.updateExpressionStatement(statement, transformed);
}
