import { build, BuildOptions } from "https://deno.land/x/esbuild@v0.23.0/mod.js";
import { ServeConfig } from "./types.ts";
import { autoTemplates } from "./features/templates.ts";
import { httpImports, reload } from "./features/httpImports.ts";
import { startDevServer } from "./features/devserver.ts";
import { jsrRemapping } from "./features/jsrRemapping.ts";

export async function serve(c: ServeConfig) {
    const outdir = c.outDir ?? "dist";

    const [ first, second ] = Deno.args;

    const noExit = Deno.env.has("NO_EXIT");
    const shouldReload = Deno.env.has("RELOAD") || second === "--reload" || first === "--reload";
    const production = Deno.env.has("BUILD") || first === "build";

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
            jsrRemapping(),
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
        splitting: Deno.env.has("CHUNKS") && production,
        format: "esm",
        logLevel: "info",
        chunkNames: "chunks/[name]-[hash]"
    };

    if (shouldReload)
        await reload();

    if (production) {
        const state = await build(config);
        if (!noExit)
            Deno.exit(state.errors.length > 0 ? 1 : 0);
    } else {
        await startDevServer(config, c);
    }
}