import { Plugin } from "https://deno.land/x/esbuild@v0.23.0/mod.js";

const namespace = "esbuild_serve:jsrRemapping";

export type Options = {
    httpResolverNamespace?: string;
};

export const jsrRemapping = (options: Options = {}): Plugin => ({
    name: namespace,
    setup(build) {
        build.onResolve({ filter: /^jsr:/ }, ({ path }) => ({
            path: `https://esm.sh/jsr/${path.replace(/^jsr:/, "")}`,
            namespace: options.httpResolverNamespace ?? "esbuild_serve:http-import"
        }));
    }
});