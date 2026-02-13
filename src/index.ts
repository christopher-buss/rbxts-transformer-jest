import type ts from "typescript";

import { collectJestNames } from "./collect-jest-names.js";
import { partitionStatements } from "./partition.js";
import { collectShadowedNames, filterShadowed } from "./shadowing.js";

export function transformer(): ts.TransformerFactory<ts.SourceFile> {
	return (context) => {
		return (sourceFile) => {
			const names = collectJestNames(sourceFile.statements);
			const shadowed = collectShadowedNames(sourceFile.statements, names);
			const filtered = filterShadowed(names, shadowed);
			const { hoisted, hoistedVariables, jestImport, rest } = partitionStatements(
				sourceFile.statements,
				filtered,
			);

			return context.factory.updateSourceFile(sourceFile, [
				...jestImport,
				...hoistedVariables,
				...hoisted,
				...rest,
			]);
		};
	};
}
