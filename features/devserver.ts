import { ServeConfig } from "../types.ts";
import { green } from "https://deno.land/std@0.172.0/fmt/colors.ts";
import * as esbuild from "https://deno.land/x/esbuild@v0.17.0/mod.js";
import { serve } from "https://deno.land/std@0.172.0/http/server.ts";

export async function startDevServer(commonConfig: esbuild.BuildOptions, c: ServeConfig) {
    const startTime = performance.now();
    console.log(`🚀 ${green("serve")} @ http://localhost:${c.port ?? 1337}`);
    const context = await esbuild.context({
        ...commonConfig,
        plugins: [
            ...commonConfig.plugins ?? []
        ],
        minify: false,
        splitting: false,
        logLevel: "silent"
    });

    // Enable watch mode
    await context.watch();

    // Enable serve mode
    const { host, port } = await context.serve({
        servedir: c.outDir ?? "dist"
    });

    // We are creating a proxy so we can have custom routing.
    await serve(async (e) => {
        // proxy everything to internal esbuild dev server;
        const url = new URL(e.url);
        url.host = host;
        url.port = port.toString();

        const rsp = await fetch(url);

        // We can't disable the file directory page
        const text = await rsp.clone().text();
        const isFileDirectoryPage = text.includes(`<title>Directory: ${url.pathname}/</title>`) && text.includes("📁");

        // esbuild doesn't automaticly append .html so we do it here
        if (!rsp.ok || isFileDirectoryPage) {
            url.pathname += ".html";
            return await fetch(url);
        }

        return rsp;
    }, {
        port: c.port ?? 1337,
        onListen: () => {
            console.log(`📦 Started in ${green(`${(performance.now() - startTime).toFixed(2)}ms`)}`);
        }
    });
}
