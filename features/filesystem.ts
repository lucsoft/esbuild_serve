import { ensureDirSync } from "jsr:@std/fs@1.0.5";

export function ensureNestedFolderExists(path: string, root: string) {
    if (!path.includes("/")) return;
    const target = path.split("/").filter((_, i, l) => i != l.length - 1).join("/");

    for (const folder of target
        .split('/')
        .map((entry, index, list) => (`/${list.filter((_, innerIndex) => innerIndex < index).join("/")}/${entry}`)
            .replace("//", "/") // first element would start with a double slash
        )) {
        ensureDirSync(`${root}${folder}`);
    }
}
