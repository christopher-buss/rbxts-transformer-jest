import { defineConfig } from "tsdown";

export default defineConfig({
	clean: true,
	dts: true,
	entry: ["src/index.ts"],
	external: ["typescript"],
	failOnWarn: false,
	fixedExtension: true,
	format: ["cjs"],
	publint: true,
	shims: true,
	target: ["node24"],
});
