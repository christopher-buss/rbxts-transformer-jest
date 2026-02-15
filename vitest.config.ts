import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			exclude: ["src/**/*.spec.ts", "src/test-helpers/**"],
			include: ["src/**/*.ts"],
			provider: "v8",
			reporter: ["text", "json-summary"],
			thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
		},
		projects: [
			{
				test: {
					name: "unit",
					include: ["src/**/*.spec.ts"],
				},
			},
			{
				test: {
					name: "integration",
					include: ["test/**/*.spec.ts"],
					sequence: { concurrent: true },
					testTimeout: 60_000,
				},
			},
		],
	},
});
