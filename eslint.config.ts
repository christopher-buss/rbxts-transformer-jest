import isentinel, { GLOB_JSON, GLOB_TS } from "@isentinel/eslint-config";

export default isentinel(
	{
		name: "project/root",
		flawless: {
			files: ["src/**/*.{ts,tsx}"],
		},
		ignores: ["reference/**"],
		namedConfigs: true,
		roblox: false,
		test: true,
		type: "package",
		typescript: {
			erasableOnly: true,
		},
	},
	{
		name: "project/root/markdown/json",
		files: [`*md/${GLOB_JSON}`],
		rules: {
			"unicorn/filename-case": "off",
		},
	},
	{
		name: "project/root/markdown/typescript",
		files: [`*md/${GLOB_TS}`],
		rules: {
			"import/first": "off",
		},
	},
);
