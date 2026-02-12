import type ts from "typescript";

export default function transformer(): ts.TransformerFactory<ts.SourceFile> {
	return () => (sourceFile) => sourceFile;
}
