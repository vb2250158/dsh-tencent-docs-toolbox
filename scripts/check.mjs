import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
for (const directory of ["src", "scripts", "tests"]) {
  for (const file of await readdir(directory)) {
    if (!/\.(?:mjs|js)$/.test(file)) continue;
    const result = spawnSync(
      process.execPath,
      ["--check", `${directory}/${file}`],
      { stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
console.log("Plugin source syntax checks passed.");
