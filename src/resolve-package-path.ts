import path from "node:path";
import ts from "typescript";

export interface CreateResolverOptions {
	loadDependencies?: () => Dependencies | undefined;
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

export function createPackageResolver(
	program: ts.Program,
	options: CreateResolverOptions = {},
): PackageResolver | undefined {
	const context = resolveProjectContext(program, options);
	if (context === undefined) {
		return undefined;
	}

	const { compilerOptions, pathTranslator, resolveModule, rojoResolver } = context;

	return {
		resolveToRbxPath(specifier: string, containingFile: string) {
			const resolvedFileName = resolveModule(specifier, containingFile, compilerOptions);
			if (resolvedFileName === undefined) {
				return;
			}

			const outputPath = pathTranslator.getOutputPath(resolvedFileName);
			const rbxPath = rojoResolver.getRbxPathFromFilePath(outputPath);
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

function defaultResolveModule(
	specifier: string,
	containingFile: string,
	options: ts.CompilerOptions,
): string | undefined {
	return ts.resolveModuleName(specifier, containingFile, options, ts.sys).resolvedModule
		?.resolvedFileName;
}

function resolveProjectContext(
	program: ts.Program,
	options: CreateResolverOptions,
): ProjectContext | undefined {
	const { loadDependencies = tryLoadDependencies, resolveModule = defaultResolveModule } =
		options;
	const compilerOptions = program.getCompilerOptions();
	const { configFilePath, outDir, rootDir } = compilerOptions;
	if (typeof configFilePath !== "string" || outDir === undefined) {
		return undefined;
	}

	const projectDirectory = path.dirname(configFilePath);
	const rootDirectory = rootDir ?? projectDirectory;

	const deps = loadDependencies();
	if (deps === undefined) {
		return undefined;
	}

	const rojoConfigPath = findRojoConfig(deps.RojoResolver, projectDirectory);
	if (rojoConfigPath === undefined) {
		return undefined;
	}

	const rojoResolver = deps.RojoResolver.fromPath(rojoConfigPath);
	const pathTranslator = new deps.PathTranslator(rootDirectory, outDir, undefined, false);

	return { compilerOptions, pathTranslator, resolveModule, rojoResolver };
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
