import ts from "typescript";

import type { JestNames } from "./constants.js";

export function collectShadowedNames(
	statements: ts.NodeArray<ts.Statement>,
	{ namespaces, tracked }: JestNames,
): Set<string> {
	const allTracked = new Set([...namespaces, ...tracked]);
	const shadowed = new Set<string>();
	for (const statement of statements) {
		if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (ts.isIdentifier(declaration.name) && allTracked.has(declaration.name.text)) {
					shadowed.add(declaration.name.text);
				}
			}
		} else if (
			ts.isFunctionDeclaration(statement) &&
			statement.name &&
			allTracked.has(statement.name.text)
		) {
			shadowed.add(statement.name.text);
		}
	}

	return shadowed;
}

export function filterShadowed(names: JestNames, shadowed: Set<string>): JestNames {
	if (shadowed.size === 0) {
		return names;
	}

	return {
		namespaces: new Set([...names.namespaces].filter((name) => !shadowed.has(name))),
		tracked: new Set([...names.tracked].filter((name) => !shadowed.has(name))),
	};
}
