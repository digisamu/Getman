import { build, context } from "esbuild";
import { pathToFileURL } from "node:url";

const options = {
  entryPoints: { main: "electron/main.ts", preload: "electron/preload.ts", http: "electron/http.ts" },
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  // http.cjs is its own bundle so main can load it lazily.
  external: ["electron", "./http.cjs"],
  sourcemap: process.argv.includes("--watch") ? "inline" : false,
  minify: !process.argv.includes("--watch"),
  logLevel: "warning"
};

export async function watchElectron(onRebuild) {
  const ctx = await context({
    ...options,
    plugins: [{ name: "notify", setup: (b) => b.onEnd((result) => result.errors.length === 0 && onRebuild?.()) }]
  });
  await ctx.rebuild();
  await ctx.watch();
  return ctx;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await build(options);
  console.log("Built Electron main and preload into dist-electron/");
}
