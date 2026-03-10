import ts from "typescript";

import { collectJestNames } from "./collect-jest-names.js";
import type { IdentifierPredicate, JestNames } from "./constants.js";
import { ALLOWED_IDENTIFIERS, REQUIRE_ACTUAL_METHOD } from "./constants.js";
import { isJestCallee, partitionBlock, partitionStatements } from "./partition.js";
import type { PackageResolver } from "./resolve-package-path.js";
import { createPackageResolver } from "./resolve-package-path.js";
import { collectShadowedNames, filterShadowed } from "./shadowing.js";
import { transformFirstArgument, transformMockArguments } from "./transform-mock-args.js";

interface TransformContext extends TransformerOptions {
	readonly factory: ts.NodeFactory;
	readonly names: JestNames;
	readonly sourceFile: ts.SourceFile;
}

interface TransformerOptions {
	readonly isAllowed: IdentifierPredicate;
	readonly jsxFactoryIdentifier: string | undefined;
	readonly packageResolver: PackageResolver | undefined;
}

export default function transformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
	const options: TransformerOptions = {
		isAllowed: createGlobalCheck(program.getTypeChecker()),
		jsxFactoryIdentifier: getJsxFactoryIdentifier(program.getCompilerOptions()),
		packageResolver: createPackageResolver(program),
	};

	return (context) => {
		return (sourceFile) => {
			const ctx = buildContext(context, sourceFile, options);
			const hoisted = ts.visitNode(
				sourceFile,
				createHoistVisitor(context, ctx),
				ts.isSourceFile,
			);

			return ts.visitNode(hoisted, createRequireActualVisitor(context, ctx), ts.isSourceFile);
		};
	};
}

function buildContext(
	context: ts.TransformationContext,
	sourceFile: ts.SourceFile,
	options: TransformerOptions,
): TransformContext {
	const names = collectJestNames(sourceFile.statements);
	const shadowed = collectShadowedNames(sourceFile.statements, names);

	return {
		...options,
		factory: context.factory,
		names: filterShadowed(names, shadowed),
		sourceFile,
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

function createHoistVisitor(
	context: ts.TransformationContext,
	ctx: TransformContext,
): (node: ts.Node) => ts.Node {
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

	return visitor;
}

function createRequireActualVisitor(
	context: ts.TransformationContext,
	ctx: TransformContext,
): (node: ts.Node) => ts.Node {
	function visitor(node: ts.Node): ts.Node {
		const visited = ts.visitEachChild(node, visitor, context);

		if (ts.isCallExpression(visited) && isRequireActualCall(visited, ctx.names)) {
			return visitRequireActual(visited, ctx);
		}

		return visited;
	}

	return visitor;
}

function getJsxFactoryIdentifier(options: ts.CompilerOptions): string | undefined {
	const factory = options.jsxFactory ?? "React.createElement";
	const dot = factory.indexOf(".");
	return dot === -1 ? factory : factory.slice(0, dot);
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
		{ isAllowed: ctx.isAllowed, jsxFactoryIdentifier: ctx.jsxFactoryIdentifier },
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
