import ts from "typescript";

import { collectJestNames } from "./collect-jest-names.js";
import type { IdentifierPredicate, JestNames } from "./constants.js";
import { ALLOWED_IDENTIFIERS, REQUIRE_ACTUAL_METHOD } from "./constants.js";
import { isJestCallee, partitionBlock, partitionStatements } from "./partition.js";
import type { PackageResolver } from "./resolve-package-path.js";
import { createPackageResolver } from "./resolve-package-path.js";
import { collectShadowedNames, filterShadowed } from "./shadowing.js";
import { transformFirstArgument, transformMockArguments } from "./transform-mock-args.js";

interface TransformContext {
	readonly factory: ts.NodeFactory;
	readonly isAllowed: IdentifierPredicate;
	readonly names: JestNames;
	readonly packageResolver: PackageResolver | undefined;
	readonly sourceFile: ts.SourceFile;
}

export default function transformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
	const isAllowed = createGlobalCheck(program.getTypeChecker());
	const packageResolver = createPackageResolver(program);

	return (context) => {
		return (sourceFile) => {
			const names = collectJestNames(sourceFile.statements);
			const shadowed = collectShadowedNames(sourceFile.statements, names);
			const filtered = filterShadowed(names, shadowed);

			const ctx: TransformContext = {
				factory: context.factory,
				isAllowed,
				names: filtered,
				packageResolver,
				sourceFile,
			};

			function visitor(node: ts.Node): ts.Node {
				const visited = ts.visitEachChild(node, visitor, context);

				if (ts.isSourceFile(visited)) {
					return visitSourceFile(visited, ctx);
				}

				if (ts.isBlock(visited)) {
					return visitBlock(visited, ctx);
				}

				return visited;
			}

			// Pass 1: partition, hoist, validate factories, transform
			// mock/unmock args
			const hoisted = ts.visitNode(sourceFile, visitor) as ts.SourceFile;

			/**
			 * Pass 2: transform jest.requireActual args (runs after
			 * validation).
			 *
			 * @param node
			 */
			function requireActualVisitor(node: ts.Node): ts.Node {
				const visited = ts.visitEachChild(node, requireActualVisitor, context);

				if (ts.isCallExpression(visited) && isRequireActualCall(visited, ctx.names)) {
					return visitRequireActual(visited, ctx);
				}

				return visited;
			}

			return ts.visitNode(hoisted, requireActualVisitor) as ts.SourceFile;
		};
	};
}

function createGlobalCheck(checker: ts.TypeChecker): IdentifierPredicate {
	return (name: string) => {
		if (ALLOWED_IDENTIFIERS.has(name)) {
			return true;
		}

		const symbol = checker.resolveName(
			name,
			undefined,
			ts.SymbolFlags.Value | ts.SymbolFlags.Namespace,
			false,
		);
		if (symbol?.declarations === undefined || symbol.declarations.length === 0) {
			return false;
		}

		return symbol.declarations.every((decl) => decl.getSourceFile().isDeclarationFile);
	};
}

function isRequireActualCall(node: ts.CallExpression, names: JestNames): boolean {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		node.expression.name.text === REQUIRE_ACTUAL_METHOD &&
		isJestCallee(node.expression.expression, names)
	);
}

function visitBlock(node: ts.Block, ctx: TransformContext): ts.Block {
	const result = partitionBlock(node.statements, ctx.names, ctx.sourceFile, ctx.isAllowed);
	if (!result) {
		return node;
	}

	return ctx.factory.updateBlock(node, [
		...result.hoistedVariables,
		...transformMockArguments(
			ctx.factory,
			result.hoisted,
			ctx.packageResolver,
			ctx.sourceFile.fileName,
		),
		...result.rest,
	]);
}

function visitRequireActual(node: ts.CallExpression, ctx: TransformContext): ts.CallExpression {
	const args = transformFirstArgument(
		ctx.factory,
		node,
		ctx.packageResolver,
		ctx.sourceFile.fileName,
	);
	if (args === node.arguments) {
		return node;
	}

	return ctx.factory.updateCallExpression(node, node.expression, node.typeArguments, args);
}

function visitSourceFile(node: ts.SourceFile, ctx: TransformContext): ts.SourceFile {
	const { dependencyImports, hoisted, hoistedVariables, jestImport, rest } = partitionStatements(
		node.statements,
		ctx.names,
		ctx.sourceFile,
		ctx.isAllowed,
	);

	return ctx.factory.updateSourceFile(node, [
		...jestImport,
		...dependencyImports,
		...hoistedVariables,
		...transformMockArguments(
			ctx.factory,
			hoisted,
			ctx.packageResolver,
			ctx.sourceFile.fileName,
		),
		...rest,
	]);
}
