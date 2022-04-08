import { build, Loader } from "https://deno.land/x/esbuild@v0.14.34/mod.js";
import { emptyDirSync, copySync, ensureDirSync } from "https://deno.land/std@0.134.0/fs/mod.ts";
import { serveDir } from "https://deno.land/std@0.134.0/http/file_server.ts";
import { serve as httpServe } from "https://deno.land/std@0.134.0/http/mod.ts";
import { bgRed, white, green } from "https://deno.land/std@0.134.0/fmt/colors.ts";
import { BuildOptions } from "https://deno.land/x/esbuild@v0.14.34/mod.js";
import { httpImports } from "https://deno.land/x/esbuild_plugin_http_imports@v1.2.3/index.ts";

export type serveConfig = {
    /** default 1337 */
    port?: number
    /** automatically provide html templates */
    pages: Record<string, string>
    /** default is `templates` */
    templateRoot?: string
    /** if a nested page wasn't found nested try use a compatible one in the root folder */
    preventTemplateRootFallback?: boolean
    outDir?: string
    assets?: Record<string, string>,
    noHtmlEntries?: Record<string, string>
    extraLoaders?: Record<string, Loader>
}

export async function serve({ port, pages, noHtmlEntries, extraLoaders, templateRoot, outDir, assets, preventTemplateRootFallback }: serveConfig) {
    const template = templateRoot ?? "templates";
    const outdir = outDir ?? "dist";
    const config: BuildOptions = {
        metafile: true,
        loader: {
            ".woff": "file",
            ".woff2": "file",
            ".html": "file",
            ".svg": "file",
            ".png": "file",
            ...extraLoaders
        },
        plugins: [
            {
                name: "statpoints",
                setup(build) {
                    build.onStart(() => {
                        emptyDirSync(outdir);
                        if (assets)
                            for (const [ publicPath, privatePath ] of Object.entries(assets)) {
                                ensureNestedFolderExists(publicPath, outdir);
                                copySync(privatePath, `${outdir}/${publicPath}`);
                            }
                        for (const id of Object.keys(pages)) {
                            if (id.endsWith("/")) throw new Error(`${id} is not allowed to end with a slash`);
                            ensureNestedFolderExists(id, outdir);
                            try {
                                copySync(`${template}/${id}.html`, `${outdir}/${id}.html`);
                            } catch {
                                const fallbackName = id.split("/").at(-1);
                                if (!preventTemplateRootFallback)
                                    copySync(`${template}/${fallbackName}.html`, `${outdir}/${id}.html`);
                                else
                                    console.error(`🥲  Couldn't find template for ${id}`)

                            }
                        }
                    })
                }
            }, httpImports() ],
        bundle: true,
        entryPoints: {
            ...pages,
            ...noHtmlEntries
        },
        outdir: outdir + "/",
        minify: true,
        splitting: true,
        format: "esm",
        logLevel: "info",
    };

    if (Deno.args[ 0 ] == "dev" || Deno.args.length === 0) {
        console.log(`🚀 ${green("serve")} @ http://localhost:${port ?? 1337}`);
        await build({
            ...config, minify: false, splitting: false,
            banner: {
                js: `const refreshWs = new WebSocket(location.origin.replace("https", "wss").replace("http", "ws") + "/websocket-update"); refreshWs.onmessage = () => location.reload();`
            },
            logLevel: "silent",
            watch: {
                onRebuild: (err) => {
                    if (err)
                        return console.log(`😔 ` + err.message.replaceAll("ERROR:", bgRed(white("ERROR"))))
                    console.log(`📦 Rebuild finished!`);
                    dispatchEvent(new Event("refresh"))
                }
            },
        });
        console.log(`📦 First build finished!`);
        httpServe((r) => {
            if (r.url.includes("websocket-update")) {
                const ws = Deno.upgradeWebSocket(r);
                const caller = () => ws.socket.send("refresh");
                addEventListener('refresh', caller, { once: true })
                ws.socket.onclose = () => removeEventListener("refresh", caller);
                return ws.response;
            } else return serveDir(r, { quiet: true, fsRoot: outdir, showDirListing: true })
        }, { port: port ?? 1337 })
    } else {
        const state = await build(config);
        Deno.exit(state.errors.length > 0 ? 1 : 0);
    }

}

function ensureNestedFolderExists(path: string, root: string) {
    if (!path.includes("/")) return;
    const target = path.split("/").filter((_, i, l) => i != l.length - 1).join("/")

    for (const folder of target
        .split('/')
        .map((entry, index, list) => (`/${list.filter((_, innerIndex) => innerIndex < index).join("/")}/${entry}`)
            .replace("//", "/") // first element would start with a double slash
        )) {
        ensureDirSync(`${root}${folder}`);
    }
}
