export const HOIST_METHODS = new Set(["mock", "unmock"]);
// Imperative jest methods whose first argument is a module specifier that must
// be resolved to an Instance path, but which must NOT be hoisted or validated
// (so their factories may reference imported helpers). `doMock`/`dontMock`
// return `jest` and can be chained; `requireActual` returns the module.
export const MODULE_PATH_METHODS = new Set(["doMock", "dontMock", "requireActual"]);
// Subset of MODULE_PATH_METHODS that returns `jest` and is therefore chainable.
export const CHAINABLE_MODULE_PATH_METHODS = new Set(["doMock", "dontMock"]);
export const JEST_MODULE = "@rbxts/jest-globals";
export const JEST_GLOBAL_NAME = "jest";
export const ALLOWED_IDENTIFIERS = new Set(["expect", "Infinity", "jest", "NaN", "undefined"]);
export const MOCK_PREFIX = /^mock/i;
export const STRIPPABLE_EXTENSIONS: ReadonlyArray<string> = [
	".d.ts",
	".tsx",
	".ts",
	".luau",
	".lua",
];

export type IdentifierPredicate = (name: string) => boolean;

export interface JestBinding {
	readonly name: string;
	readonly isNamespace: boolean;
}

export interface JestNames {
	readonly namespaces: ReadonlySet<string>;
	readonly tracked: ReadonlySet<string>;
}
