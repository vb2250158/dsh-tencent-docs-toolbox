import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";

const hostRoot =
  process.env.DSH_TEST_WORKSPACE ??
  resolve(import.meta.dirname, "../../../../deepseek-harness");
const host = resolve(hostRoot, "packages/client/ui-primitives/package.json");
const require = createRequire(host);
const { JSDOM } = require("jsdom");
const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = React;
const h = React.createElement;

test("automatic login opens once and closes on authenticated status; registrations dispose", async () => {
  const dom = new JSDOM(
    '<html><head></head><body><div id="root"></div></body></html>',
    { url: "http://localhost/" },
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let descriptor,
    state = {
      state: "login-required",
      authenticated: false,
      loginRevision: 1,
      loginOpen: false,
    },
    calls = 0;
  const primitives = {
    Button: ({ children, variant, ...props }) => h("button", props, children),
    Modal: ({ open, children }) =>
      open ? h("div", { role: "dialog" }, children) : null,
    StateDot: () => null,
    FileTypeIcon: () => null,
  };
  vm.runInNewContext(
    await readFile(new URL("../src/client.js", import.meta.url), "utf8"),
    {
      window: {
        __ModuleLoader__: {
          load(value) {
            descriptor = value;
          },
        },
      },
      document,
      location: dom.window.location,
      getComputedStyle: dom.window.getComputedStyle,
      setTimeout,
      clearTimeout,
    },
  );
  const plugin = descriptor.factory((name) =>
    name === "react" ? React : primitives,
  );
  const disposers = [],
    entries = new Map(),
    rpc = {
      call: async (_path, method) => {
        if (method === "login") {
          calls++;
          state = { ...state, state: "logging-in", loginOpen: true };
        }
        return { ok: true, value: state };
      },
    };
  plugin.apply({
    locale: { register: () => () => {}, bind: () => (key) => key },
    connection: { rpc },
    slots: {
      inject: (_name, callback) => {
        const dispose = callback();
        disposers.push(dispose);
        return dispose;
      },
      register: (opts, component) => {
        entries.set(opts.name, { opts, component });
        return () => entries.delete(opts.name);
      },
    },
    effect: (callback) => {
      const dispose = callback();
      if (typeof dispose === "function") disposers.push(dispose);
    },
    configForms: { whileServed: (_names, callback) => callback() },
    layout: { selectPanel() {}, panelInfo: { getSnapshot: () => ({}) } },
    theme: { getTheme: () => ({ active: { colorScheme: "light" } }) },
    on: () => () => {},
  });
  assert.deepEqual(
    [...entries.keys()].sort(),
    [
      "main",
      "plugins.bundle.config",
      "shell.overlay",
      "sidebar.panellist",
    ].sort(),
  );
  const overlay = entries.get("shell.overlay");
  const injected = overlay.opts.inject();
  const useAuth = () =>
    React.useSyncExternalStore(
      injected.hooks.auth.subscribe,
      injected.hooks.auth.getSnapshot,
      injected.hooks.auth.getSnapshot,
    );
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await act(async () => {
      root.render(h(overlay.component, { ...injected, useAuth }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(calls, 1);
    assert(dom.window.document.querySelector("[role=dialog]"));
    state = { ...state, state: "ready", authenticated: true, loginOpen: false };
    await act(async () => {
      await injected.hooks.auth.refresh();
    });
    assert.equal(dom.window.document.querySelector("[role=dialog]"), null);
    assert.equal(calls, 1);
  } finally {
    await act(async () => root.unmount());
    for (const dispose of disposers.reverse()) dispose?.();
    dom.window.close();
  }
  assert.equal(entries.size, 0);
});
