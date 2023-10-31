import { serve } from "../mod.ts";


Deno.test("smoke test", {
    sanitizeResources: false,
    sanitizeOps: false,
}, async () => {
    Deno.env.set("NO_EXIT", "true");
    Deno.env.set("BUILD", "true");
    await serve({
        pages: {
            "index.html": "tests/index.ts",
        }
    });
});