import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFile, mkdtemp, open, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("shipped COS adapter loads without the incompatible bare punycode subpath", async (t) => {
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "punycode/")
        throw new Error("DSH resolver cannot handle this bare subpath");
      return nextResolve(specifier, context);
    },
  });
  t.after(() => hook.deregister());
  const { default: Cos } = await import("../lib/runtime/src/cos-sdk.mjs");
  assert.equal(typeof Cos, "function");
  assert.equal(
    typeof new Cos({
      SecretId: "fixture-only-id",
      SecretKey: "fixture-only-key",
    }).putObject,
    "function",
  );
  const build = JSON.parse(
    await readFile(new URL("../lib/build.json", import.meta.url), "utf8"),
  );
  assert.equal(
    build.cosSdkSha256,
    createHash("sha256")
      .update(
        await readFile(
          new URL("../lib/runtime/src/cos-sdk.mjs", import.meta.url),
        ),
      )
      .digest("hex"),
  );
  assert(build.bundledPackages > 0);
  const licenses = await readFile(
    new URL("../lib/runtime/COS-LICENSES.txt", import.meta.url),
    "utf8",
  );
  assert.match(licenses, /cos-nodejs-sdk-v5@3\.0\.0/);
  assert.match(licenses, /punycode@/);
  const { uploadMedia } = await import("../lib/runtime/src/upload.mjs");
  const root = await mkdtemp(join(tmpdir(), "tdocs-built-upload-"));
  const path = join(root, "synthetic");
  await writeFile(path, "synthetic media");
  const handle = await open(path, "r");
  t.after(async () => {
    await handle.close();
    await rm(root, { recursive: true, force: true });
  });
  class SyntheticCos {
    async putObject(options) {
      const chunks = [];
      for await (const chunk of options.Body) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).toString("utf8"), "synthetic media");
      assert.equal(options.ContentLength, 15);
    }
  }
  const credentials = {
    cred: {
      bucket: "fixture-1234567890",
      region: "ap-guangzhou",
      resource: "tmp/*",
      credential: {
        secretId: "fixture-id",
        secretKey: "fixture-key",
        token: "fixture-token",
      },
    },
  };
  const result = await uploadMedia(
    { post: async () => credentials },
    handle,
    15,
    { Cos: SyntheticCos },
  );
  assert.match(
    result.cosURL,
    /^https:\/\/fixture-1234567890\.cos\.ap-guangzhou\.myqcloud\.com\//,
  );
});
