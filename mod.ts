import { build, Loader } from "https://deno.land/x/esbuild@v0.15.5/mod.js";
import { emptyDirSync, copySync, ensureDirSync } from "https://deno.land/std@0.152.0/fs/mod.ts";
import { serveDir, serveFile } from "https://deno.land/std@0.152.0/http/file_server.ts";
import { serve as httpServe, Status, STATUS_TEXT } from "https://deno.land/std@0.152.0/http/mod.ts";
import { bgRed, white, green } from "https://deno.land/std@0.152.0/fmt/colors.ts";
import { BuildOptions } from "https://deno.land/x/esbuild@v0.15.5/mod.js";
import { httpImports } from "./esbuild_plugin.ts";
import { posix } from "https://deno.land/std@0.152.0/path/mod.ts";
import { existsSync } from "https://deno.land/std@0.152.0/fs/mod.ts";

export type serveConfig = {
    /** default 1337 */
    port?: number;
    /** automatically provide html templates */
    pages: Record<string, string>;
    /** default is `templates` */
    templateRoot?: string;
    /** if a nested page wasn't found nested try use a compatible one in the root folder */
    preventTemplateRootFallback?: boolean;
    outDir?: string;
    assets?: Record<string, string>,
    noHtmlEntries?: Record<string, string>;
    htmlEntries?: string[];
    extraLoaders?: Record<string, Loader>,
    external?: string[],
    globals?: Record<string, string>;
};

export async function serve(c: serveConfig) {
    const template = c.templateRoot ?? "templates";
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
            ".html": "file",
            ".svg": "file",
            ".png": "file",
            ".xml": "file",
            ".txt": "file",
            ...c.extraLoaders
        },
        plugins: [
            {
                name: "statpoints",
                setup(build) {
                    build.onStart(() => {
                        emptyDirSync(outdir);
                        if (c.assets)
                            for (const [ publicPath, privatePath ] of Object.entries(c.assets)) {
                                ensureNestedFolderExists(publicPath, outdir);
                                copySync(privatePath, `${outdir}/${publicPath}`);
                            }
                        for (const id of [ ...Object.keys(c.pages), ...c.htmlEntries ?? [] ]) {
                            if (id.endsWith("/")) throw new Error(`${id} is not allowed to end with a slash`);
                            ensureNestedFolderExists(id, outdir);
                            try {
                                copySync(`${template}/${id}.html`, `${outdir}/${id}.html`);
                            } catch {
                                const fallbackName = id.split("/").at(-1);
                                if (!c.preventTemplateRootFallback)
                                    copySync(`${template}/${fallbackName}.html`, `${outdir}/${id}.html`);
                                else
                                    console.error(`🥲  Couldn't find template for ${id}`);

                            }
                        }
                    });
                }
            }, httpImports() ],
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
        console.log(`🚀 ${green("serve")} @ http://localhost:${c.port ?? 1337}`);
        await build({
            ...config, minify: false, splitting: false,
            banner: {
                ...config.banner,
                js: config.banner?.js + `;const refreshWs = new WebSocket(location.origin.replace("https", "wss").replace("http", "ws") + "/websocket-update"); refreshWs.onmessage = () => location.reload();`
            },
            logLevel: "silent",
            watch: {
                onRebuild: (err) => {
                    if (err)
                        return console.log(`😔 ` + err.message.replaceAll("ERROR:", bgRed(white("ERROR"))));
                    console.log(`📦 Rebuild finished!`);
                    dispatchEvent(new Event("refresh"));
                }
            },
        });
        console.log(`📦 First build finished!`);
        httpServe(async (r) => {
            if (r.url.includes("websocket-update")) {
                const ws = Deno.upgradeWebSocket(r);
                const caller = () => ws.socket.send("refresh");
                addEventListener('refresh', caller, { once: true });
                ws.socket.onclose = () => removeEventListener("refresh", caller);
                return ws.response;
            } else {
                // Yes i use existsSync sinc here. you know why? try catch is ugly. yes is ugly. i don't like errors.
                // And i don't want to invest in a file server that returns the file or null and then crafts a response to that.
                // Yes its the clean approach but but i think that one ms is not a real concern.
                const pathCorrect = existsSync(posix.join(outdir, new URL(r.url).pathname));
                const hasHtml = existsSync(posix.join(outdir, `${new URL(r.url).pathname}.html`));
                if (hasHtml)
                    return await serveFile(r, posix.join(outdir, `${new URL(r.url).pathname}.html`));
                if (pathCorrect)
                    return await serveDir(r, { quiet: true, fsRoot: outdir, showDirListing: true });
                return new Response(STATUS_TEXT[ Status.NotFound ], {
                    status: Status.NotFound,
                });
            }
        }, { port: c.port ?? 1337, onListen: undefined });
    } else {
        const state = await build(config);
        Deno.exit(state.errors.length > 0 ? 1 : 0);
    }

}

function ensureNestedFolderExists(path: string, root: string) {
    if (!path.includes("/")) return;
    const target = path.split("/").filter((_, i, l) => i != l.length - 1).join("/");

    for (const folder of target
        .split('/')
        .map((entry, index, list) => (`/${list.filter((_, innerIndex) => innerIndex < index).join("/")}/${entry}`)
            .replace("//", "/") // first element would start with a double slash
        )) {
        ensureDirSync(`${root}${folder}`);
    }
}
