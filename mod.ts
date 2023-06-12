import { build, BuildOptions } from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import { ServeConfig } from "./types.ts";
import { autoTemplates } from "./features/templates.ts";
import { httpImports, reload } from "./features/httpImports.ts";
import { startDevServer } from "./features/devserver.ts";

export async function serve(c: ServeConfig) {
    const outdir = c.outDir ?? "dist";

    const config: BuildOptions = {
        metafile: true,
        external: [
            "*.external.css",
            ...c.external ?? []
        ],
        loader: {
            ".woff": "file",
            ".woff2": "file",
            ".ttf": "file",
            ".html": "file",
            ".svg": "file",
            ".png": "file",
            ".webp": "file",
            ".xml": "file",
            ".txt": "file",
            ...c.extraLoaders
        },
        plugins: [
            autoTemplates(c),
            httpImports({ sideEffects: c.sideEffects }),
            ...c.plugins ?? []
        ],
        inject: [ ...c.poylfills ?? [], ...c.shims ?? [] ],
        bundle: true,
        define: c.globals,
        entryPoints: {
            ...c.pages,
            ...c.noHtmlEntries
        },
        outdir: outdir + "/",
        minify: true,
        splitting: false,
        format: "esm",
        logLevel: "info",
    };

    const [ first, second ] = Deno.args;

    if (second == "--reload" || first == "--reload")
        await reload();

    if ([ "dev", "--reload", undefined ].includes(first)) {
        await startDevServer(config, c);
    } else if (first == "build") {
        const state = await build(config);
        Deno.exit(state.errors.length > 0 ? 1 : 0);
    } else {
        console.log("🤠 Unkown Argument. Excepted dev or build. (default is dev)");
        Deno.exit(1);
    }
}