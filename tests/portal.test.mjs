import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPortal } from "../src/portal.js";

async function fixture(t, authenticated = false) {
  const root = await mkdtemp(join(tmpdir(), "tdocs-portal-"));
  const calls = [];
  const session = {
    initialize: async () => calls.push("initialize"),
    status: () => ({
      state: authenticated ? "ready" : "login-required",
      authenticated,
    }),
    startLogin: async () => calls.push("login"),
    whenReady: async () => calls.push("retry"),
    getToolbox: () => ({ catalog: () => ({ tools: [{ id: "synthetic" }] }) }),
    client: {},
  };
  const portal = createPortal(session, root);
  const connection = {
    admit(request) {
      if (request.headers.authorization === "Bearer test-guest")
        return { peer: { principal: { kind: "guest" } } };
      if (request.headers.authorization !== "Bearer test-owner")
        return { rejection: 401 };
      return { peer: { principal: { kind: "owner" } } };
    },
  };
  const server = createServer(portal.handler(connection));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await portal.dispose();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    authorization: "Bearer test-owner",
    "content-type": "application/json",
  };
  const rpc = (method, options = {}) =>
    fetch(`${base}/tencent-docs-toolbox/${method}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "client-request",
        rpcId: "test-1",
        method,
        payload: {},
      }),
      ...options,
    });
  return { base, calls, headers, rpc };
}

test("portal authenticates owner before state reads and rejects foreign browser origins", async (t) => {
  const { base, calls, headers, rpc } = await fixture(t);
  assert.equal((await fetch(`${base}/tencent-docs-toolbox/app/`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/tencent-docs-toolbox/app/`, {
        headers: { authorization: "Bearer test-guest" },
      })
    ).status,
    403,
  );
  assert.deepEqual(calls, []);
  assert.equal(
    (
      await rpc("login", {
        headers: { ...headers, origin: "https://example.com" },
      })
    ).status,
    403,
  );
  assert.deepEqual(calls, []);
  const response = await (await rpc("status")).json();
  assert.equal(response.rpcId, "test-1");
  assert.equal(response.result.value.authenticated, false);
  await rpc("login");
  assert(calls.includes("login"));
  assert.equal(
    (await fetch(`${base}/tencent-docs-toolbox/app/`, { headers })).status,
    401,
  );
});

test("ready portal serves embedded resources and shares the live toolbox catalog", async (t) => {
  const { base, headers, rpc } = await fixture(t, true);
  const page = await fetch(`${base}/tencent-docs-toolbox/app/`, { headers });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /data-api-base="\/tencent-docs-toolbox\/app"/);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'self'/,
  );
  assert.equal(
    (await fetch(`${base}/tencent-docs-toolbox/app/app.js`, { headers }))
      .status,
    200,
  );
  const catalog = await fetch(`${base}/tencent-docs-toolbox/app/v1/tools`, {
    headers,
  });
  assert.deepEqual(await catalog.json(), { tools: [{ id: "synthetic" }] });
  const invalid = await (await rpc("unknown")).json();
  assert.equal(invalid.result.ok, false);
  const oversized = await rpc("status", { body: " ".repeat(5000) });
  assert.equal((await oversized.json()).result.ok, false);
});
