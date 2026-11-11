/** Tencent Docs tools and sign-in through public DSH extension points. */
import Schema from "@deepseek-ai/schemastery";
import { homedir } from "node:os";
import { join } from "node:path";
import { TencentDocsSessionController } from "../runtime/src/session-controller.mjs";
import { createTools } from "./tools.js";
import { createPortal } from "./portal.js";

export const name = "dsh-tencent-docs-toolbox";
export const Config = Schema.object({
  dataDirectory: Schema.string().description({
    zh: "私有运行目录，留空时使用当前 DSH Home",
    en: "Private runtime directory; defaults to the current DSH Home",
  }),
  reuseStandaloneLogin: Schema.boolean()
    .default(true)
    .description({
      zh: "复用本机工具箱已保存的登录",
      en: "Reuse an existing local toolbox sign-in",
    }),
}).volatile();

/** Register reversible tools and the owner-authenticated embedded application. */
export function apply(ctx, configRef) {
  const config = configRef.get();
  const home = process.env.DSH_HOME || join(homedir(), ".dsh");
  const root =
    config.dataDirectory || join(home, "state", "tencent-docs-toolbox");
  const session = new TencentDocsSessionController(root, {
    ...(config.reuseStandaloneLogin === false
      ? { reuseSessionRoot: false }
      : {}),
  });
  const portal = createPortal(session, root, ctx.logger);
  ctx.effect(() => async () => {
    await portal.dispose();
    await session.dispose();
  });
  ctx.inject(["tools"], (scope) => {
    for (const tool of createTools(session))
      scope.effect(() => scope.tools.register(tool));
  });
  ctx.inject(["settings"], (scope) =>
    scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber)),
  );
  ctx.inject(["connection", "webServer"], (scope) => {
    scope.effect(() =>
      scope.webServer.register({
        kind: "prefix",
        path: "/tencent-docs-toolbox",
        handler: portal.handler(scope.connection),
      }),
    );
  });
}
