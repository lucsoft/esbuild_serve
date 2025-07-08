import { green } from "jsr:@std/fmt@1.0.3/colors";
import {
    ServerSentEventStream,
    type ServerSentEventMessage,
} from "jsr:@std/http@1.0.9";
import { context, type BuildOptions } from "https://deno.land/x/esbuild@v0.25.6/mod.js";
import { ServeConfig } from "../types.ts";

export async function startDevServer(commonConfig: BuildOptions, c: ServeConfig) {
    const startTime = performance.now();
    console.log(`🚀 ${green("serve")} @ http://localhost:${c.port ?? 1337}`);
    const ctx = await context({
        ...commonConfig,
        minify: false,
        banner: {
            ...commonConfig.banner ?? {},
            js: `${commonConfig.banner?.js || ''};new EventSource("/esbuild").addEventListener('change', () => window?.location?.reload?.());`
        },
        splitting: false,
        outdir: c.outDir ?? "dist",
        logLevel: "error",
        write: true,
        sourcemap: true
    });

    // Enable watch mode
    await ctx.watch();

    // Enable serve mode
    const { port } = await ctx.serve({
        servedir: c.outDir ?? "dist",
    });

    const triggers = <(() => void)[]>[];

    const changes = new EventSource(`http://localhost:${port}/esbuild`);
    let hadChanges = false;

    changes.addEventListener('change', () => {
        if (!hadChanges) {

            hadChanges = true;
            return;
        }
        console.log(`📦 Rebuild finished!`);
        triggers.forEach(() => {
            triggers.pop()?.();
        });
    });

    // We are creating a proxy so we can have custom routing.
    Deno.serve({
        port: c.port ?? 1337,
        onListen: () => {
            console.log(`📦 Started in ${green(`${(performance.now() - startTime).toFixed(2)}ms`)}`);
        }
    }, async (e) => {
        // proxy everything to internal esbuild dev server;
        const url = new URL(e.url);
        url.port = port.toString();

        if (url.pathname == "/esbuild") {
            const { readable, writable } = new TransformStream<ServerSentEventMessage, ServerSentEventMessage>();

            triggers.push(async () => {
                try {
                    const writer = writable.getWriter();
                    await writer.write({ event: "change", data: "change" });
                    writer.releaseLock();

                } catch {
                    //
                }
            });

            return new Response(readable.pipeThrough(new ServerSentEventStream()), {
                headers: {
                    "content-type": "text/event-stream",
                    "cache-control": "no-cache",
                },
            });
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
    });
}
