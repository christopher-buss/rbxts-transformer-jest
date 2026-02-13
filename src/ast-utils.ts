import ts from "typescript";

export function collectLocalBindings(node: ts.Node): Set<string> {
	const bindings = new Set<string>();
	function walk(child: ts.Node): void {
		const name = getBindingName(child);
		if (name !== undefined) {
			bindings.add(name);
		}

		ts.forEachChild(child, walk);
	}

	ts.forEachChild(node, walk);

	return bindings;
}

export function collectOuterReferences(factory: ts.Node, localBindings: Set<string>): Set<string> {
	const outer = new Set<string>();
	function walk(child: ts.Node): void {
		if (ts.isTypeNode(child)) {
			return;
		}

		if (
			ts.isIdentifier(child) &&
			isReferencePosition(child) &&
			!localBindings.has(child.text)
		) {
			outer.add(child.text);
		}

		ts.forEachChild(child, walk);
	}

	ts.forEachChild(factory, walk);

	return outer;
}

export function getBindingName(node: ts.Node): string | undefined {
	if (
		(ts.isVariableDeclaration(node) || ts.isBindingElement(node) || ts.isParameter(node)) &&
		ts.isIdentifier(node.name)
	) {
		return node.name.text;
	}

	if (ts.isFunctionDeclaration(node) && node.name) {
		return node.name.text;
	}

	if (
		ts.isCatchClause(node) &&
		node.variableDeclaration &&
		ts.isIdentifier(node.variableDeclaration.name)
	) {
		return node.variableDeclaration.name.text;
	}

	return undefined;
}

export function isReferencePosition(node: ts.Identifier): boolean {
	const { parent } = node;
	if (ts.isBindingElement(parent)) {
		return parent.name !== node && parent.propertyName !== node;
	}

	const isDeclarationName =
		((ts.isVariableDeclaration(parent) || ts.isParameter(parent)) && parent.name === node) ||
		((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) &&
			parent.name === node) ||
		(ts.isFunctionDeclaration(parent) && parent.name === node);

	return !isDeclarationName;
}
