import isentinel, { GLOB_JSON } from "@isentinel/eslint-config";

export default isentinel(
	{
		name: "project/root",
		namedConfigs: true,
		roblox: false,
		test: true,
		type: "package",
	},
	{
		name: "project/root/markdown",
		files: [`*md/${GLOB_JSON}`],
		rules: {
			"unicorn/filename-case": "off",
		},
	},
);
