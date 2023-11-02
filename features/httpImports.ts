import { green } from "https://deno.land/std@0.205.0/fmt/colors.ts";
import type {
    Loader,
    OnLoadArgs,
    OnLoadResult,
    OnResolveArgs,
    Plugin
} from "https://deno.land/x/esbuild@v0.19.4/mod.d.ts";

const namespace = "esbuild_serve:http-import";
const possibleLoaders: Loader[] = [ 'js', 'jsx', 'ts', 'tsx', 'css', 'json', 'text', 'base64', 'file', 'dataurl', 'binary', 'default' ];
const binaryLoaders: Loader[] = [ 'binary', 'file', "dataurl" ];
import { fromFileUrl } from "https://deno.land/std@0.205.0/path/mod.ts";
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

            const resolve = import.meta.resolve(path);
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


const loadMap = async (url: URL, headers: Headers) => {
    const map = await fetch(url.href, { headers });
    const type = map.headers.get("content-type")?.replace(/\s/g, "");
    const buffer = await map.arrayBuffer();
    const blob = new Blob([ buffer ], { type });
    const reader = new FileReader();
    return new Promise((cb) => {
        reader.onload = (e) => cb(e.target?.result);
        reader.readAsDataURL(blob);
    });
};

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

async function handeSourceMaps(contents: string, source: Response, headers: Headers) {
    const pattern = /\/\/# sourceMappingURL=(\S+)/;
    const match = contents.match(pattern);
    if (match) {
        const url = new URL(match[ 1 ], source.url);
        const dataurl = await loadMap(url, headers);
        const comment = `//# sourceMappingURL=${dataurl}`;
        return contents.replace(pattern, comment);
    }
    return contents;
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