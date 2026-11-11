import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

let createTools;
try {
  ({ createTools } = await import("../src/tools.js"));
} catch (error) {
  if (
    error.code !== "ERR_MODULE_NOT_FOUND" ||
    !error.message.includes("tencent-docs-web-proxy")
  )
    throw error;
  const source = await readFile(
    new URL("../src/tools.js", import.meta.url),
    "utf8",
  );
  const root =
    process.env.TDOCS_SOURCE_ROOT ??
    resolve(import.meta.dirname, "../../../../tencent-docs-web-proxy");
  const catalog = pathToFileURL(resolve(root, "src/tool-catalog.mjs")).href;
  ({ createTools } = await import(
    `data:text/javascript;base64,${Buffer.from(source.replace("tencent-docs-web-proxy/catalog", catalog)).toString("base64")}`
  ));
}

test("native tools expose all catalog actions, forward cancellation and preserve request IDs", async () => {
  const calls = [];
  const toolbox = {
    run: async (...args) => {
      calls.push(args);
      return { id: "synthetic", state: "running" };
    },
    status: async (id) => ({ id }),
    limits: { refresh: async () => ({ points: null }) },
  };
  const controller = new AbortController();
  const session = {
    initialize: async () => ({ state: "ready", authenticated: true }),
    status: () => ({ state: "ready", authenticated: true }),
    whenReady: async (signal) => {
      assert.equal(signal, controller.signal);
      return toolbox;
    },
  };
  const tools = createTools(session);
  const names = tools.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(
    names.filter(
      (name) =>
        ![
          "tencent_docs_status",
          "tencent_docs_catalog",
          "tencent_docs_limits",
          "tencent_docs_job",
          "tencent_docs_upload",
        ].includes(name),
    ).length,
    43,
  );
  const tool = tools.find(
    (item) => item.name === "tencent_docs_markdown_to_mind",
  );
  const result = await tool.execute(
    { options: { markdown: "# Test" }, requestId: "request-123" },
    { signal: controller.signal },
  );
  assert.equal(result.state, "running");
  assert.deepEqual(calls, [
    [
      "markdown_to_mind",
      { artifacts: [], options: { markdown: "# Test" } },
      "request-123",
    ],
  ]);
  assert.equal(tool.output.render({}, result)[0].type, "text");
  assert.equal(
    (await tools.find((item) => item.name === "tencent_docs_status").execute())
      .authenticated,
    true,
  );
});

test("status reflects a login completed after initial session inspection", async () => {
  const session = {
    initialize: async () => ({ state: "login-required", authenticated: false }),
    status: () => ({ state: "ready", authenticated: true }),
  };
  const status = createTools(session).find(
    (item) => item.name === "tencent_docs_status",
  );
  assert.equal((await status.execute()).authenticated, true);
});
