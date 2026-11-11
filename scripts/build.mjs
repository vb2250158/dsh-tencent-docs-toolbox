import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "lib");
await mkdir(output, { recursive: true });
await mkdir(join(output, "src"), { recursive: true });
for (const file of ["index.js", "portal.js", "tools.js"]) {
  await cp(join(root, "src", file), join(output, "src", file));
}
await cp(join(root, "runtime"), join(output, "runtime"), { recursive: true });

// Bundle the COS SDK's legacy require('punycode/') into its own ESM adapter.
// DSH owns the other runtime package resolution and all Node built-ins.
const bundled = await build({
  stdin: {
    contents: 'export { default } from "cos-nodejs-sdk-v5";',
    resolveDir: root,
    sourcefile: "cos-sdk-entry.mjs",
    loader: "js",
  },
  outfile: join(output, "runtime/src/cos-sdk.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  legalComments: "linked",
  metafile: true,
  banner: {
    js: 'import { createRequire as createCosRequire } from "node:module"; const require = createCosRequire(import.meta.url);',
  },
});
const upload = join(output, "runtime/src/upload.mjs");
const original = await readFile(upload, "utf8");
if (!original.includes("from 'cos-nodejs-sdk-v5'"))
  throw new Error("The pinned COS adapter import changed");
await writeFile(
  upload,
  original.replace("from 'cos-nodejs-sdk-v5'", "from './cos-sdk.mjs'"),
);

const packageRoots = new Set();
for (const input of Object.keys(bundled.metafile.inputs)) {
  if (!input.includes("node_modules/")) continue;
  let directory = dirname(resolve(root, input));
  while (directory !== parse(directory).root) {
    try {
      JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
      packageRoots.add(directory);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      directory = dirname(directory);
    }
  }
}
const notices = [];
for (const directory of [...packageRoots].sort()) {
  const manifest = JSON.parse(
    await readFile(join(directory, "package.json"), "utf8"),
  );
  const files = await readdir(directory);
  const licenses = files.filter((file) =>
    /^(?:licen[cs]e|copying|notice)(?:[.-]|$)/i.test(file),
  );
  if (!licenses.length)
    licenses.push(...files.filter((file) => /^readme(?:\.|$)/i.test(file)));
  const texts = await Promise.all(
    licenses.map((file) => readFile(join(directory, file), "utf8")),
  );
  notices.push(
    `${manifest.name}@${manifest.version}\nDeclared license: ${JSON.stringify(manifest.license ?? manifest.licenses)}\n${texts.join("\n")}`,
  );
}
await writeFile(
  join(output, "runtime/COS-LICENSES.txt"),
  notices.join("\n\n---\n\n").replace(/[\t ]+$/gm, "").trimEnd() + "\n",
);
const sdkPath = join(output, "runtime/src/cos-sdk.mjs");
const sdkText = (await readFile(sdkPath, "utf8"))
  .split("\n")
  .map(line => /^\s*(?:\*|\/\/)/.test(line) ? line.trimEnd() : line)
  .join("\n")
  .replace(/\n+$/, "\n");
await writeFile(sdkPath, sdkText);
const sdk = Buffer.from(sdkText);
const source = JSON.parse(
  await readFile(join(root, "runtime/source.json"), "utf8"),
);
await writeFile(
  join(output, "build.json"),
  JSON.stringify(
    {
      runtimeCommit: source.commit,
      cosSdkSha256: createHash("sha256").update(sdk).digest("hex"),
      bundledPackages: packageRoots.size,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Built the shared runtime and COS adapter with ${packageRoots.size} dependency licenses`,
);
