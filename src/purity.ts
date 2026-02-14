import ts from "typescript";

export function collectPureConstants(
	statements: ReadonlyArray<ts.Statement> | ts.NodeArray<ts.Statement>,
): ReadonlySet<string> {
	const names = new Set<string>();
	for (const statement of statements) {
		if (
			!ts.isVariableStatement(statement) ||
			(statement.declarationList.flags & ts.NodeFlags.Const) === 0
		) {
			continue;
		}

		for (const decl of statement.declarationList.declarations) {
			if (
				ts.isIdentifier(decl.name) &&
				decl.initializer &&
				isPureExpression(decl.initializer)
			) {
				names.add(decl.name.text);
			}
		}
	}

	return names;
}

// eslint-disable-next-line max-lines-per-function -- switch dispatch on SyntaxKind
export function isPureExpression(node: ts.Node): boolean {
	// eslint-disable-next-line ts/switch-exhaustiveness-check -- intentional subset
	switch (node.kind) {
		case ts.SyntaxKind.ArrayLiteralExpression: {
			return isPureArrayLiteral(node as ts.ArrayLiteralExpression);
		}
		case ts.SyntaxKind.ArrowFunction:
		case ts.SyntaxKind.BigIntLiteral:
		case ts.SyntaxKind.FalseKeyword:
		case ts.SyntaxKind.FunctionExpression:
		case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
		case ts.SyntaxKind.NullKeyword:
		case ts.SyntaxKind.NumericLiteral:
		case ts.SyntaxKind.RegularExpressionLiteral:
		case ts.SyntaxKind.StringLiteral:
		case ts.SyntaxKind.TrueKeyword: {
			return true;
		}
		case ts.SyntaxKind.AsExpression:
		case ts.SyntaxKind.NonNullExpression:
		case ts.SyntaxKind.ParenthesizedExpression:
		case ts.SyntaxKind.SatisfiesExpression:
		case ts.SyntaxKind.VoidExpression: {
			return isPureExpression((node as ts.VoidExpression).expression);
		}
		case ts.SyntaxKind.BinaryExpression: {
			return isPureBinary(node as ts.BinaryExpression);
		}
		case ts.SyntaxKind.ConditionalExpression: {
			return isPureConditional(node as ts.ConditionalExpression);
		}
		case ts.SyntaxKind.ObjectLiteralExpression: {
			return isPureObjectLiteral(node as ts.ObjectLiteralExpression);
		}
		case ts.SyntaxKind.PrefixUnaryExpression: {
			return isPureExpression((node as ts.PrefixUnaryExpression).operand);
		}
		case ts.SyntaxKind.TemplateExpression: {
			return (node as ts.TemplateExpression).templateSpans.every((span) => {
				return isPureExpression(span.expression);
			});
		}
		default: {
			return false;
		}
	}
}

function isPureArrayLiteral(node: ts.ArrayLiteralExpression): boolean {
	return node.elements.every((element) => {
		return ts.isSpreadElement(element)
			? isPureExpression(element.expression)
			: isPureExpression(element);
	});
}

function isPureBinary(node: ts.BinaryExpression): boolean {
	return isPureExpression(node.left) && isPureExpression(node.right);
}

function isPureConditional(node: ts.ConditionalExpression): boolean {
	return (
		isPureExpression(node.condition) &&
		isPureExpression(node.whenTrue) &&
		isPureExpression(node.whenFalse)
	);
}

function isPureObjectLiteral(node: ts.ObjectLiteralExpression): boolean {
	return node.properties.every((property) => {
		if (ts.isPropertyAssignment(property)) {
			const keyPure = ts.isComputedPropertyName(property.name)
				? isPureExpression(property.name.expression)
				: true;
			return keyPure && isPureExpression(property.initializer);
		}

		if (ts.isShorthandPropertyAssignment(property)) {
			return false;
		}

		if (ts.isSpreadAssignment(property)) {
			return isPureExpression(property.expression);
		}

		// MethodDeclaration, GetAccessorDeclaration, SetAccessorDeclaration
		// are closure creation — pure
		return true;
	});
}
