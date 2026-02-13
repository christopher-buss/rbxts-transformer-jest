import ts from "typescript";

import { collectJestNames } from "./collect-jest-names.js";
import type { JestNames } from "./constants.js";
import { partitionBlock, partitionStatements } from "./partition.js";
import { collectShadowedNames, filterShadowed } from "./shadowing.js";

export function transformer(): ts.TransformerFactory<ts.SourceFile> {
	return (context) => {
		return (sourceFile) => {
			const names = collectJestNames(sourceFile.statements);
			const shadowed = collectShadowedNames(sourceFile.statements, names);
			const filtered = filterShadowed(names, shadowed);

			function visitor(node: ts.Node): ts.Node {
				const visited = ts.visitEachChild(node, visitor, context);

				if (ts.isSourceFile(visited)) {
					return visitSourceFile(visited, filtered, context.factory);
				}

				if (ts.isBlock(visited)) {
					return visitBlock(visited, filtered, context.factory);
				}

				return visited;
			}

			return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
		};
	};
}

function visitBlock(node: ts.Block, names: JestNames, factory: ts.NodeFactory): ts.Block {
	const result = partitionBlock(node.statements, names);
	if (!result) {
		return node;
	}

	return factory.updateBlock(node, [
		...result.hoistedVariables,
		...result.hoisted,
		...result.rest,
	]);
}

function visitSourceFile(
	node: ts.SourceFile,
	names: JestNames,
	factory: ts.NodeFactory,
): ts.SourceFile {
	const { hoisted, hoistedVariables, jestImport, rest } = partitionStatements(
		node.statements,
		names,
	);

	return factory.updateSourceFile(node, [
		...jestImport,
		...hoistedVariables,
		...hoisted,
		...rest,
	]);
}
