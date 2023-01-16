# esbuild_serve
Live Reload. Persistent HTTP Import Resolution. Templates. Dev Server. A Deno Web bundler.

## Get denoing 🦕🔨

### Pages
Pages are a simple way to get going fast.
```ts
import { serve } from "https://deno.land/x/esbuild_serve/mod.ts";

serve({
    port: 8100,
    pages: {
        "index": "demo/index.ts"
    }
});
```
This will automatically create a HTML Template for you. If you want to have a custom one just place it in `templates/demo/index.html`.
### Custom Assets
Adding plain assets to your build folder goes like this
```ts
import { serve } from "https://deno.land/x/esbuild_serve/mod.ts";

serve({ 
    pages: { "index": "index.ts" },
    assets: {
        "favicon.ico": "./static/favicon.ico"
    }
})
```
### Custom Templates
If you have have a setup like this: `serve({ pages: { "/document/page/index": "index.ts" } })`
```
Resoultion will be like this:
/templates/document/page/index.html

If this fails, then: 
/templates/index.html

Fallback:
Autogenerated via filename
```

You can place an html file at these locations. 

## Releasing your bundle

As simple as starting deno with the args `deno run -A serve.ts build`

## Note 

- Since v1.2.0 live reload is fully done by esbuild (since 0.17) and the dev server is based opon esbuild (with custom routing added on top)
