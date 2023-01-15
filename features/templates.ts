import { copySync } from "https://deno.land/std@0.168.0/fs/copy.ts";
import { emptyDirSync } from "https://deno.land/std@0.168.0/fs/empty_dir.ts";
import { Plugin } from "https://deno.land/x/esbuild@v0.16.7/mod.js";
import { ServeConfig } from "../types.ts";
import { ensureNestedFolderExists } from "./filesystem.ts";

export function provideTemplate(id: string, outdir: string, template: string, c: ServeConfig) {
    if (id.endsWith("/"))
        throw new Error(`${id} is not allowed to end with a slash`);
    ensureNestedFolderExists(id, outdir);
    try {
        copySync(`${template}/${id}.html`, `${outdir}/${id}.html`);
    } catch {
        try {
            fallbackTemplate(c, template, outdir, id);
        } catch (_) {
            autoGeneratedTemplate(outdir, id);
        }
    }
}

export function autoGeneratedTemplate(outdir: string, id: string) {
    const fallbackName = id.split("/").at(-1);

    Deno.writeTextFileSync(`${outdir}/${id}.html`, `<link rel="stylesheet" href="${fallbackName}.css"><script src="${fallbackName}.js" type="module"></script>`, { create: true });
}

export function fallbackTemplate(c: ServeConfig, template: string, outdir: string, id: string) {
    const fallbackName = id.split("/").at(-1);

    if (!c.preventTemplateRootFallback)
        copySync(`${template}/${fallbackName}.html`, `${outdir}/${id}.html`);
    else
        console.error(`🥲 Couldn't find template for ${id}`);
}

export const autoTemplates = (c: ServeConfig): Plugin => ({
    name: "templates",
    setup(build) {
        const template = c.templateRoot ?? "templates";
        const outdir = c.outDir ?? "dist";

        build.onStart(() => {
            emptyDirSync(outdir);
            if (c.assets)
                for (const [ publicPath, privatePath ] of Object.entries(c.assets)) {
                    ensureNestedFolderExists(publicPath, outdir);
                    copySync(privatePath, `${outdir}/${publicPath}`);
                }
            for (const id of [ ...Object.keys(c.pages), ...c.htmlEntries ?? [] ]) {
                provideTemplate(id, outdir, template, c);
            }
        });
    }
});