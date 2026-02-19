import type ts from "typescript";

import { STRIPPABLE_EXTENSIONS } from "./constants.js";

const VALID_IDENTIFIER = /^[a-z_$][a-z\d_$]*$/i;

export function resolveRelativeModulePath(
	factory: ts.NodeFactory,
	specifier: string,
): ts.Expression | undefined {
	if (!specifier.startsWith(".")) {
		return undefined;
	}

	const stripped = stripExtension(specifier.replace(/\/+$/, ""));
	const segments = stripped.split("/");
	const { base, rest } = buildBase(factory, segments);

	if (rest.length === 0) {
		return undefined;
	}

	let result = base;
	for (const segment of rest) {
		result = accessSegment(factory, result, segment);
	}

	return result;
}

function accessSegment(
	factory: ts.NodeFactory,
	base: ts.Expression,
	segment: string,
): ts.Expression {
	if (isValidIdentifier(segment)) {
		return factory.createPropertyAccessExpression(base, segment);
	}

	return factory.createElementAccessExpression(base, factory.createStringLiteral(segment));
}

function buildBase(
	factory: ts.NodeFactory,
	segments: ReadonlyArray<string>,
): { base: ts.Expression; rest: ReadonlyArray<string> } {
	let base: ts.Expression = factory.createPropertyAccessExpression(
		factory.createIdentifier("script"),
		"Parent",
	);
	let index = 0;

	for (; index < segments.length; index++) {
		const segment = segments[index];
		if (segment === ".") {
			// Current directory — already at script.Parent
		} else if (segment === "..") {
			base = factory.createPropertyAccessExpression(base, "Parent");
		} else {
			break;
		}
	}

	const tail = segments.slice(index);
	const rest = tail.at(-1) === "index" ? tail.slice(0, -1) : tail;

	return { base, rest };
}

function isValidIdentifier(name: string): boolean {
	return VALID_IDENTIFIER.test(name);
}

function stripExtension(modulePath: string): string {
	for (const extension of STRIPPABLE_EXTENSIONS) {
		if (modulePath.endsWith(extension)) {
			return modulePath.slice(0, -extension.length);
		}
	}

	return modulePath;
}
