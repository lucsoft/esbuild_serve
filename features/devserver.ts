import { ServeConfig } from "../types.ts";
import { green } from "https://deno.land/std@0.209.0/fmt/colors.ts";
import * as esbuild from "https://deno.land/x/esbuild@v0.19.9/mod.js";
import { serve } from "https://deno.land/std@0.209.0/http/server.ts";
// polyfill until EventSource is ready from deno.
import { EventSource } from "https://deno.land/x/eventsource@v0.0.3/mod.ts";
export async function startDevServer(commonConfig: esbuild.BuildOptions, c: ServeConfig) {
    const startTime = performance.now();
    console.log(`🚀 ${green("serve")} @ http://localhost:${c.port ?? 1337}`);
    const context = await esbuild.context({
        ...commonConfig,
        minify: false,
        banner: {
            ...commonConfig.banner ?? {},
            js: (commonConfig.banner?.[ "js" ] || '') + `new EventSource(new URL("/esbuild",location.href).toString()).addEventListener('change', () => location.reload());`
        },
        splitting: false,
        logLevel: "error"
    });

    // Enable watch mode
    await context.watch();

    // Enable serve mode
    const { port } = await context.serve({
        servedir: c.outDir ?? "dist"
    });

    const changes = new EventSource("http://localhost:" + port + "/esbuild");

    changes.onmessage = () => console.log(`📦 Rebuild finished!`);

    await context.rebuild();

    // We are creating a proxy so we can have custom routing.
    await serve(async (e) => {
        // proxy everything to internal esbuild dev server;
        const url = new URL(e.url);
        url.port = port.toString();

        if (url.pathname == "/esbuild") {
            return Response.redirect(url);
        }
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
