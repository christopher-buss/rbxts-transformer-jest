import { defineConfig } from "tsdown";

export default defineConfig({
	clean: true,
	dts: true,
	entry: ["src/index.ts"],
	exports: true,
	fixedExtension: true,
	format: ["esm"],
	publint: true,
	shims: true,
	target: ["node24"],
});
