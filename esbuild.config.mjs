import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

await esbuild.build({
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2020",
  sourcemap: prod ? false : "inline",
  minify: prod,
  treeShaking: true,
  logLevel: "info",
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  external: ["obsidian"],
  define: { "process.env.NODE_ENV": prod ? '"production"' : '"development"' },
});

console.log("build ok");