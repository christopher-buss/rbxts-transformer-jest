import ts from "typescript";

import type { JestBinding, JestNames } from "./constants.js";
import { JEST_GLOBAL_NAME, JEST_MODULE } from "./constants.js";

export function collectJestNames(statements: ts.NodeArray<ts.Statement>): JestNames {
	const tracked = new Set<string>();
	const namespaces = new Set<string>();
	for (const statement of statements) {
		if (!isJestModuleImport(statement)) {
			continue;
		}

		const binding = extractJestBinding(statement);
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

export function isJestModuleImport(node: ts.Node): node is ts.ImportDeclaration {
	return (
		ts.isImportDeclaration(node) &&
		ts.isStringLiteral(node.moduleSpecifier) &&
		node.moduleSpecifier.text === JEST_MODULE
	);
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
