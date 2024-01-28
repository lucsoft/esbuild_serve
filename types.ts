import { Loader, Plugin } from "https://deno.land/x/esbuild@v0.20.0/mod.js";

export type ServeConfig = {
    /** default 1337 */
    port?: number;
    /** automatically provide html templates */
    pages: Record<string, string>;
    /** default is `templates` */
    templateRoot?: string;
    /** if a nested page wasn't found nested try use a key-equal one in the root folder */
    preventTemplateRootFallback?: boolean;
    outDir?: string;
    assets?: Record<string, string>,
    noHtmlEntries?: Record<string, string>;
    htmlEntries?: string[];
    extraLoaders?: Record<string, Loader>,
    external?: string[],

    /**
     * Define Global KeyValues.
     *
     * `globals: { "ENV": "development"}`
     *
     * turn into `globalThis.ENV == development`
     */
    globals?: Record<string, string>;

    sideEffects?: boolean;

    /**
     * Append Plugins to the default plugins
     */
    plugins?: Plugin[];

    /**
     * Add polyfills to your entrypoints
     *
     * Should be URLs
     */
    poylfills?: string[];
    shims?: string[];
    /**
     * Defaults to a simple css & js loader
     */
    defaultTemplate?: (name: string, path: string) => string;
};
