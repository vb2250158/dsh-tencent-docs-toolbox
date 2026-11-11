import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const commit = "94659228088fea30b4c2fbca47751763fdff4110";
if (!process.argv[2])
  throw new Error("Pass the upstream Git checkout as the first argument");
const source = resolve(process.argv[2]);
const destination = new URL("../runtime/", import.meta.url);

function git(...args) {
  const result = spawnSync("git", ["-C", source, ...args], {
    encoding: null,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `Could not read the pinned runtime revision with git ${args[0]}`,
    );
  return result.stdout;
}

// Read only the immutable public revision, including its original MIT license.
const files = git(
  "ls-tree",
  "-r",
  "--name-only",
  commit,
  "src",
  "web",
  "package.json",
  "LICENSE",
)
  .toString("utf8")
  .trim()
  .split("\n");
const hashes = {};
for (const file of files) {
  if (!/^(?:src|web)\/[a-zA-Z0-9_.-]+$|^(?:package\.json|LICENSE)$/.test(file))
    throw new Error("Unexpected runtime source path");
  const bytes = git("show", `${commit}:${file}`);
  const path = join(fileURLToPath(destination), file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  hashes[file] = createHash("sha256").update(bytes).digest("hex");
}
const manifest = JSON.parse(
  git("show", `${commit}:package.json`).toString("utf8"),
);
await writeFile(
  new URL("source.json", destination),
  JSON.stringify(
    {
      repository: "https://github.com/vb2250158/tencent-docs-web-proxy",
      commit,
      version: manifest.version,
      files: hashes,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Synchronized ${files.length} runtime files from ${commit}`);
