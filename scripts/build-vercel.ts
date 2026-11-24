/**
 * Produces a Vercel Build Output API v3 bundle in .vercel/output:
 *   static/          the built web app (apps/web/dist)
 *   functions/api.func  the Hono API + MCP server bundled into one ESM file
 * Bundling ourselves (instead of letting Vercel trace TS workspace packages)
 * keeps the function self-contained and deterministic.
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");
const out = join(root, ".vercel/output");
const fn = join(out, "functions/api.func");

await rm(out, { recursive: true, force: true });
await $`bun run --filter @notes/web build`.cwd(root);
await mkdir(fn, { recursive: true });
await cp(join(root, "apps/web/dist"), join(out, "static"), { recursive: true });

const result = await Bun.build({
  entrypoints: [join(root, "apps/server/src/vercel.ts")],
  target: "node",
  format: "esm",
  minify: true,
  // Optional native speedups of `ws`; not needed for libSQL over HTTP.
  external: ["bufferutil", "utf-8-validate"],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
const [bundle] = result.outputs;
await writeFile(join(fn, "index.mjs"), await bundle!.text());
console.log(`api.func/index.mjs ${(bundle!.size / 1024).toFixed(0)} kB`);

await writeFile(
  join(fn, ".vc-config.json"),
  JSON.stringify({
    runtime: "nodejs22.x",
    handler: "index.mjs",
    launcherType: "Nodejs",
    shouldAddHelpers: false,
    supportsResponseStreaming: true,
    maxDuration: 30,
    // Co-locate with the Turso primary (aws-ap-south-1, Mumbai).
    regions: ["bom1"],
  }),
);

await writeFile(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "^/assets/(.*)$",
          headers: { "cache-control": "public, max-age=31536000, immutable" },
          continue: true,
        },
        { handle: "filesystem" },
        // API, remote MCP endpoint and OAuth discovery -> the function (path preserved).
        { src: "^/(api(?:/.*)?|mcp|\\.well-known/.*)$", dest: "/api" },
        // Everything else is the SPA.
        { src: "^/(.*)$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
console.log("Vercel build output ready at .vercel/output");
