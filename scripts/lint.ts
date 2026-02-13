import fileEntryCache from "file-entry-cache";
import type { Buffer } from "node:buffer";
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";

const ESLINT_CACHE_PATH = ".eslintcache";

interface HookInput {
	tool_input: {
		file_path: string;
	};
}

function findEntryPoints(sourceRoot: string): Array<string> {
	const candidates = ["index.ts", "cli.ts", "main.ts"];
	return candidates.map((name) => join(sourceRoot, name)).filter((path) => existsSync(path));
}

function findImporters(filePath: string): Array<string> {
	try {
		const absPath = resolve(filePath);
		const sourceRoot = findSourceRoot(absPath);
		if (sourceRoot === undefined) {
			return [];
		}

		const entryPoints = findEntryPoints(sourceRoot);
		if (entryPoints.length === 0) {
			return [];
		}

		const graph = getDependencyGraph(sourceRoot, entryPoints);
		const targetRelative = relative(sourceRoot, absPath).replace(/\\/g, "/");

		// Invert graph: find files that import the target
		const importers: Array<string> = [];
		for (const [file, deps] of Object.entries(graph)) {
			if (deps.includes(targetRelative)) {
				importers.push(join(sourceRoot, file));
			}
		}

		return importers;
	} catch {
		console.error("madge not available, skipping importer invalidation");
		return [];
	}
}

function findSourceRoot(filePath: string): string | undefined {
	let current = dirname(filePath);
	while (current !== dirname(current)) {
		if (existsSync(join(current, "package.json"))) {
			const sourceDirectory = join(current, "src");
			if (existsSync(sourceDirectory)) {
				return sourceDirectory;
			}

			return current;
		}

		current = dirname(current);
	}

	return undefined;
}

function getDependencyGraph(
	sourceRoot: string,
	entryPoints: Array<string>,
): Record<string, Array<string>> {
	const entryArgs = entryPoints.map((ep) => `"${ep}"`).join(" ");
	const output = execSync(`pnpm madge --json ${entryArgs}`, {
		cwd: sourceRoot,
		encoding: "utf-8",
		stdio: ["pipe", "pipe", "pipe"],
		timeout: 30000,
	});

	return JSON.parse(output) as Record<string, Array<string>>;
}

function invalidateCacheEntries(filePaths: Array<string>): void {
	if (filePaths.length === 0) {
		return;
	}

	if (!existsSync(ESLINT_CACHE_PATH)) {
		return;
	}

	const cache = fileEntryCache.createFromFile(ESLINT_CACHE_PATH);
	for (const file of filePaths) {
		cache.removeEntry(file);
	}

	cache.reconcile();
}

function isHookInput(value: unknown): value is HookInput {
	if (typeof value !== "object" || value === null || !("tool_input" in value)) {
		return false;
	}

	const { tool_input } = value as { tool_input: unknown };
	return typeof tool_input === "object" && tool_input !== null && "file_path" in tool_input;
}

function restartEslintDaemon(): void {
	// cspell:ignore eslint_d
	try {
		spawn("pnpm", ["eslint_d", "restart"], {
			detached: true,
			stdio: "ignore",
		})
			.on("error", () => {
				console.error("eslint_d not found");
			})
			.unref();
	} catch {
		console.error("eslint_d not found");
	}
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

// Invalidate cache for files that import this file (cross-file type dependencies)
const importers = findImporters(filePath);
invalidateCacheEntries(importers);

try {
	// cspell:ignore eslint_d
	execSync(`pnpm exec eslint_d --cache --fix --max-warnings 0 "${filePath}"`, {
		env: { ...process.env, ESLINT_IN_EDITOR: "true" },
		stdio: "pipe",
	});
} catch (err) {
	const error = err as { message?: string; stderr?: Buffer; stdout?: Buffer };
	const stdout = error.stdout?.toString() ?? "";
	const stderr = error.stderr?.toString() ?? "";
	const message = error.message ?? "";

	let output = stdout;

	if (output === "") {
		output = stderr;
	}

	if (output === "") {
		output = message;
	}

	if (/error/i.test(output)) {
		const maxErrors = 5;
		const allErrors = output.split("\n").filter((line) => /error/i.test(line));
		const errorCount = allErrors.length;
		const errors = allErrors.slice(0, maxErrors).join("\n");
		const truncated = errorCount > maxErrors;

		const userMessage = `⚠️ Lint errors in ${filePath}:\n${errors}${truncated ? "\n..." : ""}`;
		const claudeMessage = `⚠️ Lint errors in ${filePath}:\n${errors}${truncated ? "\n(run lint to view more)" : ""}`;

		console.error(userMessage);
		console.log(
			JSON.stringify({
				hookSpecificOutput: {
					additionalContext: claudeMessage,
					hookEventName: "PostToolUse",
				},
				systemMessage: userMessage,
			}),
		);
		restartEslintDaemon();
		process.exit(0);
	}
}

// Restart daemon for next run
restartEslintDaemon();
