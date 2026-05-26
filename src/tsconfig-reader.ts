import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export type TsConfigReader = (configPath: string) => unknown;

export function defaultReadTsConfig(configPath: string): unknown {
	let text: string;
	try {
		text = fs.readFileSync(configPath, "utf8");
	} catch {
		return undefined;
	}

	return ts.parseConfigFileTextToJson(configPath, text).config;
}

export function resolveRojoFromTsConfig(
	configFilePath: string,
	readTsConfig: TsConfigReader,
): string | undefined {
	const visited = new Set<string>();
	let current: string | undefined = configFilePath;
	while (current !== undefined && !visited.has(current)) {
		visited.add(current);
		const config = readTsConfig(current);
		const rojo = readRbxtsRojo(config);
		if (rojo !== undefined) {
			return path.resolve(path.dirname(current), rojo);
		}

		const extension = readExtends(config);
		current = extension === undefined ? undefined : resolveExtendsPath(current, extension);
	}

	return undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readExtends(config: unknown): string | undefined {
	if (!isObjectRecord(config)) {
		return undefined;
	}

	const extension = config["extends"];
	return typeof extension === "string" ? extension : undefined;
}

function readRbxtsRojo(config: unknown): string | undefined {
	if (!isObjectRecord(config)) {
		return undefined;
	}

	const { rbxts } = config;
	if (!isObjectRecord(rbxts)) {
		return undefined;
	}

	const { rojo } = rbxts;
	return typeof rojo === "string" ? rojo : undefined;
}

function resolveExtendsPath(fromFile: string, extendsValue: string): string | undefined {
	if (!extendsValue.startsWith(".") && !path.isAbsolute(extendsValue)) {
		return undefined;
	}

	const resolved = path.resolve(path.dirname(fromFile), extendsValue);
	return resolved.endsWith(".json") ? resolved : `${resolved}.json`;
}
