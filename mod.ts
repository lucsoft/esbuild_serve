import { build, BuildOptions } from "https://deno.land/x/esbuild@v0.17.0/mod.js";
import { ServeConfig } from "./types.ts";
import { autoTemplates } from "./features/templates.ts";
import { httpImports } from "./features/httpImports.ts";
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
        bundle: true,
        entryPoints: {
            ...c.pages,
            ...c.noHtmlEntries
        },
        outdir: outdir + "/",
        minify: true,
        splitting: false,
        format: "esm",
        logLevel: "info",
        banner: {
            js: Object.entries(c.globals ?? {}).map(([ key, value ]) => `globalThis[${key}]=${JSON.stringify(value)}`).join(";")
        }
    };
    if (Deno.args[ 0 ] == "dev" || Deno.args.length === 0) {
        await startDevServer(config, c);
    } else if (Deno.args[ 0 ] == "build") {
        const state = await build(config);
        Deno.exit(state.errors.length > 0 ? 1 : 0);
    } else {
        console.log("🤠 Unkown Argument. Excepted dev or build. (default is dev)");
        Deno.exit(1);
    }
}