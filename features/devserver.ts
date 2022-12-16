import { existsSync } from "https://deno.land/std@0.168.0/fs/exists.ts";
import { serveDir, serveFile } from "https://deno.land/std@0.168.0/http/file_server.ts";
import { Status, STATUS_TEXT } from "https://deno.land/std@0.168.0/http/http_status.ts";
import { posix } from "https://deno.land/std@0.168.0/path/mod.ts";
import { ServeConfig } from "../types.ts";
import { serve as httpServe } from "https://deno.land/std@0.168.0/http/mod.ts";
import { isLiveReload, liveReloadHookin, returnLiveReload } from "./livereload.ts";
import { bgRed, green, white } from "https://deno.land/std@0.168.0/fmt/colors.ts";
import { build, BuildOptions } from "https://deno.land/x/esbuild@v0.16.7/mod.js";

export async function returnFileResponse(c: ServeConfig, r: Request) {
    const outdir = c.outDir ?? "dist";

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

export async function startDevServer(commonConfig: BuildOptions, c: ServeConfig) {
    const startTime = performance.now();
    console.log(`🚀 ${green("serve")} @ http://localhost:${c.port ?? 1337}`);
    await build({
        ...commonConfig,
        minify: false,
        splitting: false,
        banner: {
            ...commonConfig.banner,
            js: commonConfig.banner?.js + liveReloadHookin
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
    console.log(`📦 Started in ${green(`${(performance.now() - startTime).toFixed(2)}ms`)}`);
    httpServe((r) => {
        if (isLiveReload(r)) return returnLiveReload(r);

        return returnFileResponse(c, r);
    }, { port: c.port ?? 1337, onListen: undefined });
}
