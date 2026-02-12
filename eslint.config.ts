import isentinel, { GLOB_JSON } from "@isentinel/eslint-config";

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
		name: "project/root/markdown",
		files: [`*md/${GLOB_JSON}`],
		rules: {
			"unicorn/filename-case": "off",
		},
	},
);
