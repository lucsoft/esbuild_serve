import { green } from "https://deno.land/std@0.168.0/fmt/colors.ts";
import type {
    Loader,
    OnLoadArgs,
    OnLoadResult,
    OnResolveArgs,
    Plugin
} from "https://deno.land/x/esbuild@v0.16.7/mod.d.ts";

const namespace = "http-import";
const possibleLoaders: Loader[] = [ 'js', 'jsx', 'ts', 'tsx', 'css', 'json', 'text', 'base64', 'file', 'dataurl', 'binary', 'default' ];
const binaryLoaders: Loader[] = [ 'binary', 'file', "dataurl" ];

const CACHE = await caches.open("esbuild_serve_0");

export type Options = {
    sideEffects?: boolean;
    allowPrivateModules?: boolean;
    defaultToJavascriptIfNothingElseFound?: boolean;
    disableCache?: boolean;
    onCacheMiss?: (path: string) => void;
    onCacheHit?: (path: string) => void;
};

export const httpImports = (options: Options = {}): Plugin => ({
    name: namespace,
    setup(build) {
        build.onResolve({ filter: /^[^\.]+/ }, ({ path }: OnResolveArgs) => ({ path: import.meta.resolve(path), namespace }));
        build.onResolve({ filter: /^https:\/\// }, ({ path }: OnResolveArgs) => ({ path, namespace }));
        build.onResolve({ filter: /.*/, namespace }, ({ path, importer }: OnResolveArgs) => ({
            sideEffects: options.sideEffects ?? false,
            namespace,
            path: path.startsWith(".")
                ? new URL(path.replace(/\?.*/, ""), importer).toString()
                : import.meta.resolve(path),
        }));
        build.onLoad({ filter: /.*/, namespace }, async ({ path }: OnLoadArgs): Promise<OnLoadResult> => {
            const headers = new Headers();
            if (options.allowPrivateModules) appendAuthHeaderFromPrivateModules(path, headers);

            const source = await useResponseCacheElseLoad(options, path, headers);
            if (!source.ok) throw new Error(`GET ${path} failed: status ${source.status}`);
            let contents = await source.clone().text();
            contents = await handeSourceMaps(contents, source, headers);
            const { pathname } = new URL(path);

            // Find perfect Loader for extension
            const loader = build.initialOptions.loader?.[ `.${pathname.split(".").at(-1)}` ] ?? (pathname.match(/[^.]+$/)?.[ 0 ]) as (Loader | undefined);
            return {
                contents: binaryLoaders.includes(loader ?? "default")
                    ? new Uint8Array(await source.clone().arrayBuffer())
                    : contents,
                loader: options.defaultToJavascriptIfNothingElseFound
                    ? (loader && possibleLoaders.includes(loader)
                        ? loader
                        : "js")
                    : loader
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
    const newRes = await fetch(path.split("?")[ 0 ], { headers });
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