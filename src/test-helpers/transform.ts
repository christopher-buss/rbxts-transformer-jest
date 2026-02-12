import ts from "typescript";

import transformer from "../index.js";

// eslint-disable-next-line unicorn/no-keyword-prefix -- TS API property name
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

export function transformCode(input: string): string {
	const sourceFile = ts.createSourceFile("test.ts", input, ts.ScriptTarget.ESNext, true);
	const factory = transformer();
	const result = ts.transform(sourceFile, [factory]);
	const transformed = result.transformed[0];
	if (!transformed) {
		throw new Error("Transform produced no output");
	}

	const output = printer.printFile(transformed);
	result.dispose();
	return output;
}
