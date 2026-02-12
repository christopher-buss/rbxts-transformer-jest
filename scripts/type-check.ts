import { createFilesMatcher, parseTsconfig } from "get-tsconfig";
import type { Buffer } from "node:buffer";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

interface HookInput {
	tool_input: {
		file_path: string;
	};
}

function isHookInput(value: unknown): value is HookInput {
	if (typeof value !== "object" || value === null || !("tool_input" in value)) {
		return false;
	}

	const { tool_input } = value as { tool_input: unknown };
	return typeof tool_input === "object" && tool_input !== null && "file_path" in tool_input;
}

// Synchronous stdin read
const input: unknown = JSON.parse(readFileSync(0, "utf-8"));

if (!isHookInput(input)) {
	throw new Error(`Unexpected hook input shape: ${JSON.stringify(input)}`);
}

const filePath = input.tool_input.file_path;

if (typeof filePath !== "string" || !/\.(ts|tsx)$/.test(filePath)) {
	process.exit(0);
}

// Cache file for tsconfig hash in .claude/state/
const projectDirectory = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
const stateDirectory = join(projectDirectory, ".claude", "state");
if (!existsSync(stateDirectory)) {
	mkdirSync(stateDirectory, { recursive: true });
}

const cacheFile = join(stateDirectory, "tsconfig-cache.txt");

function findTsconfigForFile(targetFile: string): string | undefined {
	let directory = dirname(targetFile);
	const root = projectDirectory;

	while (directory.length >= root.length) {
		const solutionConfig = join(directory, "tsconfig.json");
		if (existsSync(solutionConfig)) {
			return resolveViaReferences(directory, solutionConfig, targetFile) ?? solutionConfig;
		}

		const parent = dirname(directory);
		if (parent === directory) {
			break;
		}

		directory = parent;
	}

	return undefined;
}

function resolveViaReferences(
	directory: string,
	configPath: string,
	targetFile: string,
): string | undefined {
	const config = parseTsconfig(configPath);
	const { references } = config;
	if (references === undefined || references.length === 0) {
		return undefined;
	}

	for (const ref of references) {
		const refPath = resolve(directory, ref.path);
		const refConfigPath = refPath.endsWith(".json") ? refPath : join(refPath, "tsconfig.json");
		if (!existsSync(refConfigPath)) {
			continue;
		}

		const refConfig = parseTsconfig(refConfigPath);
		const matcher = createFilesMatcher({ config: refConfig, path: refConfigPath });
		if (matcher(targetFile)) {
			return refConfigPath;
		}
	}

	return undefined;
}

const tsconfig = findTsconfigForFile(filePath);
// No tsconfig found, skip
if (tsconfig === undefined) {
	process.exit(0);
}

if (existsSync(tsconfig)) {
	const content = readFileSync(tsconfig, "utf-8");
	const currentHash = createHash("sha256").update(content).digest("hex");
	const cachedHash = existsSync(cacheFile) ? readFileSync(cacheFile, "utf-8").trim() : "";

	if (currentHash !== cachedHash) {
		writeFileSync(cacheFile, currentHash);
	}
}

try {
	// cspell:ignore tsgo
	execSync(`pnpm exec tsgo -p "${tsconfig}" --noEmit --pretty false`, {
		stdio: "pipe",
	});
} catch (err_) {
	const err = err_ as { message?: string; stderr?: Buffer; stdout?: Buffer };
	const stdout = err.stdout?.toString() ?? "";
	const stderr = err.stderr?.toString() ?? "";
	const message = err.message ?? "";

	let output = stdout;
	if (output === "") {
		output = stderr;
	}

	if (output === "") {
		output = message;
	}

	if (/error TS/i.test(output)) {
		const maxErrors = 5;
		const allErrors = output.split("\n").filter((line) => /error TS/i.test(line));
		const errorCount = allErrors.length;
		const errors = allErrors.slice(0, maxErrors).join("\n");
		const truncated = errorCount > maxErrors;

		const userMessage = `⚠️ TypeScript found ${errorCount} type error(s):\n${errors}${truncated ? "\n..." : ""}`;
		const claudeMessage = `⚠️ TypeScript found ${errorCount} type error(s):\n${errors}${truncated ? "\n(run typecheck to view more)" : ""}`;

		console.log(
			JSON.stringify({
				hookSpecificOutput: {
					additionalContext: claudeMessage,
					hookEventName: "PostToolUse",
				},
				systemMessage: userMessage,
			}),
		);
		process.exit(0);
	} else {
		// Exit 1: stderr shown in verbose mode only (user)
		console.error(`⚠️ Type-check hook failed:\n${output}`);
		process.exit(1);
	}
}
