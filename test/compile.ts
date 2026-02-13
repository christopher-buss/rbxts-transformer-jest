/// <reference types="vite/client" />
import { resolve } from "node:path/posix";
import { VirtualProject } from "roblox-ts";

import { transformer } from "../src/index.js";

export function compile(source: string): string {
	const project = new VirtualProject();
	// @ts-expect-error: our TS 5.8 TransformerFactory vs roblox-ts's bundled TS
	// 5.5
	project.tsTransformers.push(() => transformer());

	loadRbxtsTypes(project);

	for (const name of ["foo", "a", "b"]) {
		project.vfs.writeFile(`/src/${name}.ts`, `export const ${name} = 1;\n`);
	}

	// Appended ;export {} forces roblox-ts to treat the source as an ESM module
	return project.compileSource(`${source}\n;export {};`);
}

function firstStringField(value: JSONValue, ...keys: Array<string>): string | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}

	for (const key of keys) {
		const field = value[key];
		if (typeof field === "string") {
			return field;
		}
	}

	return undefined;
}

function loadRbxtsTypes(project: VirtualProject): void {
	const files = import.meta.glob<string>("../node_modules/@rbxts/**/{package.json,*.d.ts}", {
		eager: true,
		import: "default",
		query: "?raw",
	});
	for (const [path, content] of Object.entries(files)) {
		const absolutePath = path.replace("../", "/");
		project.vfs.writeFile(absolutePath, content);
		if (path.endsWith(".d.ts")) {
			continue;
		}

		const packageJson = JSON.parse(content);
		// All @rbxts packages are scoped, so the name is always 2 segments (e.g.
		// @rbxts/jest)
		const packageName = absolutePath.split("/").slice(-3, -1).join("/");
		const mainPath = resolvePackagePath(
			packageName,
			firstStringField(packageJson, "main") ?? "",
		);
		const typingsEntry = firstStringField(packageJson, "types", "typings");
		const typingsPath = resolvePackagePath(packageName, typingsEntry ?? "index.d.ts");
		project.setMapping(`/node_modules/${typingsPath}`, `/node_modules/${mainPath}`);
	}
}

function resolvePackagePath(packageName: string, relative: string): string {
	return resolve(`/${packageName}`, relative).substring(1);
}
