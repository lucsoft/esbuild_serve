import { assert } from "https://deno.land/std@0.219.0/assert/assert.ts";
import { serve } from "../mod.ts";
import { assertEquals } from "https://deno.land/std@0.219.0/assert/assert_equals.ts";


Deno.test("jsr test", {
    sanitizeResources: false,
    sanitizeOps: false,
}, async () => {
    Deno.env.set("NO_EXIT", "true");
    Deno.env.set("BUILD", "true");
    await serve({
        pages: {
            "jsr": "tests/jsr.ts",
        }
    });

    const cmd = await new Deno.Command("deno", {
        args: [
            "run",
            "dist/jsr.js"
        ]
    }).output();


    assert(cmd.stderr.length === 0, "stderr is not empty");

    assertEquals((await new Response(cmd.stdout).text()).trim(), "1000");
});