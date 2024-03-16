import { green } from "https://deno.land/std@0.220.1/fmt/colors.ts";
import {
    ServerSentEventStream,
    type ServerSentEventMessage,
} from "https://deno.land/std@0.220.1/http/server_sent_event_stream.ts";
// @deno-types="https://deno.land/x/esbuild@v0.20.1/mod.d.ts"
import * as esbuild from "https://deno.land/x/esbuild@v0.20.2/mod.js";
import { ServeConfig } from "../types.ts";

import { EventSource } from "https://deno.land/x/eventsource@v0.0.3/mod.ts";


export async function startDevServer(commonConfig: esbuild.BuildOptions, c: ServeConfig) {
    const startTime = performance.now();
    console.log(`🚀 ${green("serve")} @ http://localhost:${c.port ?? 1337}`);
    const context = await esbuild.context({
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
    await context.watch();

    // Enable serve mode
    const { port } = await context.serve({
        servedir: c.outDir ?? "dist",
    });

    const triggers = <(() => void)[]>[];

    const changes = new EventSource(`http://localhost:${port}/esbuild`);
    let hadChanges = false;

    changes.addEventListener('change', (e) => {
        if (!hadChanges) {

            hadChanges = true;
            return;
        }
        console.log(JSON.parse((<MessageEvent>e).data));
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
