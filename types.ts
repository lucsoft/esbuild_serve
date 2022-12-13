import { Loader, Plugin } from "https://deno.land/x/esbuild@v0.16.5/mod.js";

export type serveConfig = {
    /** default 1337 */
    port?: number;
    /** automatically provide html templates */
    pages: Record<string, string>;
    /** default is `templates` */
    templateRoot?: string;
    /** if a nested page wasn't found nested try use a compatible one in the root folder */
    preventTemplateRootFallback?: boolean;
    outDir?: string;
    assets?: Record<string, string>,
    noHtmlEntries?: Record<string, string>;
    htmlEntries?: string[];
    extraLoaders?: Record<string, Loader>,
    external?: string[],
    globals?: Record<string, string>;
    plugins?: Plugin[];
};
