import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export interface CreateResolverOptions {
	loadDependencies?: () => Dependencies | undefined;
	readTsConfig?: TsConfigReader;
	resolveModule?: ModuleResolver;
}

export interface Dependencies {
	PathTranslator: PathTranslatorConstructor;
	RojoResolver: RojoResolverStatic;
}

export interface PackageResolver {
	resolveToRbxPath(specifier: string, containingFile: string): ReadonlyArray<string> | undefined;
}

type ModuleResolver = (
	specifier: string,
	containingFile: string,
	options: ts.CompilerOptions,
) => string | undefined;

interface OwnerTranslator {
	readonly fileNames: ReadonlySet<string>;
	readonly pathTranslator: PathTranslatorLike;
}

type PathTranslatorConstructor = new (
	rootDirectory: string,
	outDirectory: string,
	buildInfoOutputPath: string | undefined,
	declaration: boolean,
) => PathTranslatorLike;

interface PathTranslatorLike {
	getOutputPath(filePath: string): string;
}

interface ProjectContext {
	readonly compilerOptions: ts.CompilerOptions;
	readonly ownerTranslators: ReadonlyArray<OwnerTranslator>;
	readonly pathTranslator: PathTranslatorLike;
	readonly resolveModule: ModuleResolver;
	readonly rojoResolver: RojoResolverLike;
}

interface RojoResolverLike {
	getRbxPathFromFilePath(filePath: string): ReadonlyArray<string> | undefined;
}

interface RojoResolverStatic {
	findRojoConfigFilePath(projectPath: string): { path: string | undefined };
	fromPath(rojoConfigFilePath: string): RojoResolverLike;
}

type TsConfigReader = (configPath: string) => unknown;

export function createPackageResolver(
	program: ts.Program,
	options: CreateResolverOptions = {},
): PackageResolver | undefined {
	const context = resolveProjectContext(program, options);
	if (context === undefined) {
		return undefined;
	}

	const { compilerOptions, ownerTranslators, pathTranslator, resolveModule, rojoResolver } =
		context;

	return {
		resolveToRbxPath(specifier: string, containingFile: string) {
			const resolvedFileName = resolveModule(specifier, containingFile, compilerOptions);
			if (resolvedFileName === undefined) {
				return;
			}

			if (isUnderNodeModules(resolvedFileName)) {
				const rbxPath = rojoResolver.getRbxPathFromFilePath(resolvedFileName);
				return stripIndexSegment(rbxPath);
			}

			const translator =
				pickOwnerTranslator(ownerTranslators, resolvedFileName) ?? pathTranslator;
			const rbxPath = rojoResolver.getRbxPathFromFilePath(
				translator.getOutputPath(resolvedFileName),
			);
			return stripIndexSegment(rbxPath);
		},
	};
}

export function findRojoConfig(
	resolver: { findRojoConfigFilePath(projectPath: string): { path: string | undefined } },
	projectDirectory: string,
): string | undefined {
	try {
		return resolver.findRojoConfigFilePath(projectDirectory).path;
	} catch {
		return undefined;
	}
}

export function rbxPathToExpression(
	factory: ts.NodeFactory,
	rbxPath: ReadonlyArray<string>,
): ts.Expression | undefined {
	const service = rbxPath[0];
	if (service === undefined) {
		return undefined;
	}

	const base = factory.createCallExpression(
		factory.createPropertyAccessExpression(factory.createIdentifier("game"), "GetService"),
		undefined,
		[factory.createStringLiteral(service)],
	);

	return chainFindFirstChild(factory, base, rbxPath.slice(1));
}

export function resolvePackagePath(
	factory: ts.NodeFactory,
	specifier: string,
	containingFile: string,
	resolver: PackageResolver,
): ts.Expression | undefined {
	if (specifier.startsWith(".")) {
		return undefined;
	}

	const rbxPath = resolver.resolveToRbxPath(specifier, containingFile);
	if (rbxPath === undefined) {
		return undefined;
	}

	return rbxPathToExpression(factory, rbxPath);
}

/* v8 ignore start -- integration-only: require catch + ts.resolveModuleName */
export function tryLoadDependencies():
	| undefined
	| { PathTranslator: PathTranslatorConstructor; RojoResolver: RojoResolverStatic } {
	try {
		// eslint-disable-next-line ts/no-require-imports -- optional peer deps loaded at runtime
		const rojoModule = require("@roblox-ts/rojo-resolver") as {
			RojoResolver: RojoResolverStatic;
		};
		// eslint-disable-next-line ts/no-require-imports -- optional peer deps loaded at runtime
		const pathModule = require("@roblox-ts/path-translator") as {
			PathTranslator: PathTranslatorConstructor;
		};

		return { PathTranslator: pathModule.PathTranslator, RojoResolver: rojoModule.RojoResolver };
	} catch {
		return undefined;
	}
}

function chainFindFirstChild(
	factory: ts.NodeFactory,
	base: ts.Expression,
	segments: ReadonlyArray<string>,
): ts.Expression {
	const chained = segments.reduce<ts.Expression>((accumulator, segment) => {
		return factory.createCallExpression(
			factory.createPropertyAccessExpression(
				factory.createNonNullExpression(accumulator),
				"FindFirstChild",
			),
			undefined,
			[factory.createStringLiteral(segment)],
		);
	}, base);

	if (segments.length > 0) {
		return factory.createAsExpression(chained, factory.createTypeReferenceNode("ModuleScript"));
	}

	return chained;
}

function defaultReadTsConfig(configPath: string): unknown {
	let text: string;
	try {
		text = fs.readFileSync(configPath, "utf8");
	} catch {
		return undefined;
	}

	return ts.parseConfigFileTextToJson(configPath, text).config;
}

function defaultResolveModule(
	specifier: string,
	containingFile: string,
	options: ts.CompilerOptions,
): string | undefined {
	return ts.resolveModuleName(specifier, containingFile, options, ts.sys).resolvedModule
		?.resolvedFileName;
}

function resolveRojoFromTsConfig(
	configFilePath: string,
	readTsConfig: TsConfigReader,
): string | undefined {
	const config = readTsConfig(configFilePath) as undefined | { rbxts?: { rojo?: unknown } };
	const rojo = config?.rbxts?.rojo;
	if (typeof rojo !== "string") {
		return undefined;
	}

	return path.resolve(path.dirname(configFilePath), rojo);
}

const NODE_MODULES_RE = /[\\/]node_modules[\\/]/;

interface BuildContextInput {
	readonly deps: Dependencies;
	readonly outDirectory: string;
	readonly resolveModule: ModuleResolver;
	readonly rojoConfigPath: string;
	readonly rootDirectory: string;
}

function buildContext(program: ts.Program, input: BuildContextInput): ProjectContext {
	const { deps, outDirectory, resolveModule, rojoConfigPath, rootDirectory } = input;
	return {
		compilerOptions: program.getCompilerOptions(),
		ownerTranslators: collectOwnerTranslators(program, deps.PathTranslator),
		pathTranslator: new deps.PathTranslator(rootDirectory, outDirectory, undefined, false),
		resolveModule,
		rojoResolver: deps.RojoResolver.fromPath(rojoConfigPath),
	};
}

function buildOwnerTranslator(
	commandLine: ts.ParsedCommandLine,
	PathTranslatorCtor: PathTranslatorConstructor,
): OwnerTranslator | undefined {
	const { fileNames, options } = commandLine;
	if (typeof options.outDir !== "string") {
		return undefined;
	}

	const { configFilePath } = options as { configFilePath?: unknown };
	const referenceRoot =
		options.rootDir ??
		(typeof configFilePath === "string" ? path.dirname(configFilePath) : undefined);
	if (referenceRoot === undefined) {
		return undefined;
	}

	const pathTranslator = new PathTranslatorCtor(referenceRoot, options.outDir, undefined, false);
	return { fileNames: new Set(fileNames), pathTranslator };
}

function collectOwnerTranslators(
	program: ts.Program,
	PathTranslatorCtor: PathTranslatorConstructor,
): Array<OwnerTranslator> {
	const references = program.getResolvedProjectReferences() ?? [];
	const translators: Array<OwnerTranslator> = [];
	for (const reference of references) {
		if (reference === undefined) {
			continue;
		}

		const owner = buildOwnerTranslator(reference.commandLine, PathTranslatorCtor);
		if (owner !== undefined) {
			translators.push(owner);
		}
	}

	return translators;
}

function isUnderNodeModules(filePath: string): boolean {
	return NODE_MODULES_RE.test(filePath);
}

function pickOwnerTranslator(
	translators: ReadonlyArray<OwnerTranslator>,
	filePath: string,
): PathTranslatorLike | undefined {
	for (const owner of translators) {
		if (owner.fileNames.has(filePath)) {
			return owner.pathTranslator;
		}
	}

	return undefined;
}

function resolveProjectContext(
	program: ts.Program,
	options: CreateResolverOptions,
): ProjectContext | undefined {
	const { configFilePath, outDir, rootDir } = program.getCompilerOptions();
	const deps = (options.loadDependencies ?? tryLoadDependencies)();
	if (typeof configFilePath !== "string" || outDir === undefined || deps === undefined) {
		return undefined;
	}

	const projectDirectory = path.dirname(configFilePath);
	const rojoConfigPath = resolveRojoConfigPath(
		configFilePath,
		projectDirectory,
		options.readTsConfig ?? defaultReadTsConfig,
		deps.RojoResolver,
	);
	if (rojoConfigPath === undefined) {
		return undefined;
	}

	return buildContext(program, {
		deps,
		outDirectory: outDir,
		resolveModule: options.resolveModule ?? defaultResolveModule,
		rojoConfigPath,
		rootDirectory: rootDir ?? projectDirectory,
	});
}

function resolveRojoConfigPath(
	configFilePath: string,
	projectDirectory: string,
	readTsConfig: TsConfigReader,
	rojoResolverStatic: RojoResolverStatic,
): string | undefined {
	return (
		resolveRojoFromTsConfig(configFilePath, readTsConfig) ??
		findRojoConfig(rojoResolverStatic, projectDirectory)
	);
}

function stripIndexSegment(
	rbxPath: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> | undefined {
	if (rbxPath === undefined || rbxPath.length === 0) {
		return rbxPath;
	}

	const last = rbxPath.at(-1);
	if (last === "index" || last?.includes(".") === true) {
		return rbxPath.slice(0, -1);
	}

	return rbxPath;
}
