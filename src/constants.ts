export const HOIST_METHODS = new Set(["mock", "unmock"]);
export const JEST_MODULE = "@rbxts/jest-globals";
export const JEST_GLOBAL_NAME = "jest";
export const ALLOWED_IDENTIFIERS = new Set(["expect", "Infinity", "jest", "NaN", "undefined"]);
export const MOCK_PREFIX = /^mock/i;

export interface JestBinding {
	readonly name: string;
	readonly isNamespace: boolean;
}

export interface JestNames {
	readonly namespaces: ReadonlySet<string>;
	readonly tracked: ReadonlySet<string>;
}
