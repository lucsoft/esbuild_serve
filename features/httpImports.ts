import { green } from "jsr:@std/fmt@1.0.3/colors";
import type {
    Loader,
    OnLoadArgs,
    OnLoadResult,
    OnResolveArgs,
    Plugin
} from "https://deno.land/x/esbuild@v0.24.0/mod.d.ts";

const namespace = "esbuild_serve:http-import";
const possibleLoaders: Loader[] = [ 'js', 'jsx', 'ts', 'tsx', 'css', 'json', 'text', 'base64', 'file', 'dataurl', 'binary', 'default' ];
const binaryLoaders: Loader[] = [ 'binary', 'file', "dataurl" ];
import { fromFileUrl } from "jsr:@std/path@1.0.3";

let CACHE = await caches.open("esbuild_serve_0");

export async function reload() {
    await caches.delete("esbuild_serve_0");
    CACHE = await caches.open("esbuild_serve_0");
}

export type Options = {
    sideEffects?: boolean;
    allowPrivateModules?: boolean;
    disableCache?: boolean;
    reloadOnCachedError?: boolean;
    onCacheMiss?: (path: string) => void;
    onCacheHit?: (path: string) => void;
    preventRemapOfJSR?: boolean;
};

export function remapPathBasedOnSettings(options: Options, path: string): string {

    if (!options.preventRemapOfJSR && path.startsWith("jsr:")) {
        return `https://esm.sh/jsr/${path.replace(/^jsr:\/?/, "")}`;
    }

    return path;
};

export const httpImports = (options: Options = {}): Plugin => ({
    name: namespace,
    setup(build) {
        build.onResolve({ filter: /^[^\.]+/ }, ({ path, importer, namespace: name }: OnResolveArgs) => {
            // fix for missing baseURL in import.meta.resolve
            if (name == namespace && path.startsWith("/"))
                return { path: new URL(path, importer).toString(), namespace };

            if (import.meta.resolve(path).startsWith("file:"))
                return { path: fromFileUrl(import.meta.resolve(path)) };
            // return { path: new URL(path, importer).toString(), namespace };

            const resolve = remapPathBasedOnSettings(options, import.meta.resolve(remapPathBasedOnSettings(options, path)));
            return { path: resolve, namespace };
        });
        build.onResolve({ filter: /^https:\/\// }, ({ path }: OnResolveArgs) => ({ path, namespace }));
        build.onResolve({ filter: /.*/, namespace }, ({ path, importer }: OnResolveArgs) => ({
            sideEffects: options.sideEffects ?? false,
            namespace,
            path: path.startsWith(".")
                ? new URL(path.replace(/\?.*/, ""), importer).toString()
                : import.meta.resolve(path),
        }));
        build.onLoad({ filter: /.*/, namespace }, async ({ path }: OnLoadArgs): Promise<OnLoadResult> => {
            if (path.startsWith("data:")) return { contents: path, loader: "base64" };
            const headers = new Headers();
            if (options.allowPrivateModules) appendAuthHeaderFromPrivateModules(path, headers);
            const source = await useResponseCacheElseLoad(options, path, headers);
            if (!source.ok) throw new Error(`GET ${path} failed: status ${source.status}`);
            const contents = await source.clone().text();
            // contents = await handeSourceMaps(contents, source, headers);
            const { pathname } = new URL(path);

            const loaderFromContentType = {
                "application/typescript": <Loader>"ts",
                "application/javascript": <Loader>"js"
            }[ source.headers.get("content-type")?.split(";").at(0) ?? "" ] ?? undefined;

            const predefinedLoader = build.initialOptions.loader?.[ `.${pathname.split(".").at(-1)}` ];

            const guessLoader = (pathname.match(/[^.]+$/)?.[ 0 ]) as (Loader | undefined);

            // Choose Loader.
            const loader = predefinedLoader
                ?? loaderFromContentType
                ?? (possibleLoaders.includes(guessLoader!) ? guessLoader : undefined)
                ?? "file";

            return {
                contents: binaryLoaders.includes(loader ?? "default")
                    ? new Uint8Array(await source.clone().arrayBuffer())
                    : contents,
                loader
            };
        });
    }
});

async function useResponseCacheElseLoad(options: Options, path: string, headers: Headers): Promise<Response> {
    const url = new URL(path);
    const res = await CACHE.match(url);
    if (res && !options.disableCache) {
        options.onCacheHit?.(path);
        return res;
    }
    console.log(`🔭 Caching ${green(path)}`);
    options.onCacheMiss?.(path);
    const newRes = await fetch(path, { headers });
    if (newRes.ok)
        await CACHE.put(url, newRes.clone());
    return newRes;
}

function appendAuthHeaderFromPrivateModules(path: string, headers: Headers) {
    const env = Deno.env.get("DENO_AUTH_TOKENS")?.trim();
    if (!env) return;

    try {
        const denoAuthToken = env.split(";").find(x => new URL(`https://${x.split("@").at(-1)!}`).hostname == new URL(path).hostname);

        if (!denoAuthToken) return;

        if (denoAuthToken.includes(":"))
            headers.append("Authorization", `Basic ${btoa(denoAuthToken.split('@')[ 0 ])}`);
        else
            headers.append("Authorization", `Bearer ${denoAuthToken.split('@')[ 0 ]}`);

    } catch (error) {
        console.log(error, env);
        return;
    }
}