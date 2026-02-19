import ts from "typescript";

import { ALLOWED_IDENTIFIERS } from "../constants.js";
import transformer from "../index.js";

const declarationFile = ts.createSourceFile("globals.d.ts", "", ts.ScriptTarget.ESNext);

const mockDeclaration = { getSourceFile: () => declarationFile } as unknown as ts.Declaration;

const MOCK_SYMBOL = { declarations: [mockDeclaration] };

const MOCK_GLOBALS = new Set([
	"CFrame",
	"game",
	"print",
	"task",
	"Vector3",
	...ALLOWED_IDENTIFIERS,
]);

const mockChecker = {
	resolveName: (name: string) => (MOCK_GLOBALS.has(name) ? MOCK_SYMBOL : undefined),
} as unknown as ts.TypeChecker;

export const mockProgram = {
	getCompilerOptions: () => ({}),
	getTypeChecker: () => mockChecker,
} as unknown as ts.Program;

// eslint-disable-next-line unicorn/no-keyword-prefix -- TS API property name
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

export function transformCode(input: string): string {
	const sourceFile = ts.createSourceFile("test.ts", input, ts.ScriptTarget.ESNext, true);
	const factory = transformer(mockProgram);
	const result = ts.transform(sourceFile, [factory]);
	const transformed = result.transformed[0];
	if (!transformed) {
		throw new Error("Transform produced no output");
	}

	const output = printer.printFile(transformed);
	result.dispose();
	return output;
}
