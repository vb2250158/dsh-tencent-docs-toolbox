/** DSH navigation and automatic account sign-in use public client services. */
window.__ModuleLoader__.load({
  id: "dsh-tencent-docs-toolbox",
  factory: (require) => {
    const React = require("react");
    const h = React.createElement;
    const {
      Button,
      Modal,
      StateDot,
      FileTypeIcon,
    } = require("@deepseek-ai/dsh-client-ui-primitives");
    const namespace = "plugins.tencent-docs-toolbox";
    const panelId = "tencent-docs-toolbox";
    const zh = {
      title: "腾讯文档工具箱",
      loginTitle: "登录腾讯文档",
      login: "打开登录页面",
      waiting: "已打开腾讯文档，请使用 QQ 或微信完成登录",
      ready: "已登录，会话已保存",
      checking: "正在检查登录状态",
      cancelled: "登录窗口已关闭，可重新打开",
      unavailable: "暂时无法检查登录，请重试",
      retry: "重试",
      close: "稍后继续",
      open: "打开工具箱",
      back: "返回聊天",
      loginRequired: "登录自己的腾讯文档账号即可使用",
      retained: "下次打开会自动复用已保存的登录",
      error: "连接未完成，请重试",
      pageTitle: "腾讯文档工具箱",
    };
    const en = {
      title: "Tencent Docs toolbox",
      loginTitle: "Sign in to Tencent Docs",
      login: "Open sign-in page",
      waiting: "Tencent Docs is open. Sign in with QQ or WeChat.",
      ready: "Signed in. Session saved.",
      checking: "Checking sign-in",
      cancelled: "The sign-in window was closed. You can reopen it.",
      unavailable: "Could not check the saved session. Retry.",
      retry: "Retry",
      close: "Continue later",
      open: "Open toolbox",
      back: "Back to chat",
      loginRequired: "Sign in with your own Tencent Docs account to continue.",
      retained: "Your saved sign-in will be reused next time.",
      error: "Connection did not complete. Retry.",
      pageTitle: "Tencent Docs toolbox",
    };

    function createAuthSource(rpc) {
      let snapshot = {
        state: "checking",
        authenticated: false,
        loginRevision: 0,
        loginOpen: false,
      };
      let disposed = false;
      let timer;
      let refreshing;
      const listeners = new Set();
      const notify = () => {
        for (const listener of listeners) listener();
      };
      const call = async (method) => {
        const response = await rpc.call("/tencent-docs-toolbox", method, {});
        if (!response.ok) throw new Error("error");
        return response.value;
      };
      const refresh = () => {
        if (disposed) return Promise.resolve(snapshot);
        refreshing ??= call("status")
          .then((value) => {
            if (!disposed) {
              snapshot = value;
              notify();
            }
            return value;
          })
          .catch(() => {
            if (!disposed) {
              snapshot = {
                ...snapshot,
                state: "unavailable",
                error: { code: "TOOLBOX_REQUEST_FAILED" },
              };
              notify();
            }
            return snapshot;
          })
          .finally(() => {
            refreshing = undefined;
            if (!disposed && listeners.size)
              timer = setTimeout(
                refresh,
                snapshot.authenticated ? 15000 : 1000,
              );
          });
        return refreshing;
      };
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener);
          if (listeners.size === 1) void refresh();
          return () => {
            listeners.delete(listener);
            if (!listeners.size) clearTimeout(timer);
          };
        },
        refresh,
        async login() {
          await call("login");
          return refresh();
        },
        async retry() {
          await call("retry");
          return refresh();
        },
        dispose() {
          disposed = true;
          clearTimeout(timer);
          listeners.clear();
        },
      };
    }

    function LoginBody({ auth, t, login, retry }) {
      const state = auth.state;
      const label = auth.authenticated
        ? "ready"
        : state === "logging-in"
          ? "waiting"
          : state === "login-cancelled"
            ? "cancelled"
            : state === "unavailable"
              ? "unavailable"
              : state === "checking"
                ? "checking"
                : "loginRequired";
      return h(
        "div",
        { className: "tdocs-login-body", "data-tdocs-login-state": state },
        h(
          "div",
          { className: "tdocs-login-status" },
          h(StateDot, {
            state: auth.authenticated
              ? "done"
              : state === "unavailable"
                ? "error"
                : state === "logging-in"
                  ? "ongoing"
                  : "idle",
          }),
          h("p", { role: "status" }, t(label)),
        ),
        h("p", { className: "tdocs-secondary" }, t("retained")),
        !auth.authenticated
          ? h(
              Button,
              {
                variant: "primary",
                onClick: () =>
                  void (state === "unavailable" ? retry() : login()).catch(
                    () => {},
                  ),
              },
              t(state === "unavailable" ? "retry" : "login"),
            )
          : null,
      );
    }

    function AutoLogin({ useAuth, login, retry, t }) {
      const auth = useAuth();
      const attempted = React.useRef(null);
      const dismissed = React.useRef(null);
      const [open, setOpen] = React.useState(false);
      React.useEffect(() => {
        if (auth.authenticated) {
          setOpen(false);
          return;
        }
        if (
          auth.state === "login-required" &&
          attempted.current !== auth.loginRevision
        ) {
          attempted.current = auth.loginRevision;
          setOpen(true);
          void login().catch(() => {});
        } else if (auth.loginOpen && dismissed.current !== auth.loginRevision)
          setOpen(true);
      }, [auth.authenticated, auth.state, auth.loginRevision, auth.loginOpen]);
      const close = () => {
        dismissed.current = auth.loginRevision;
        setOpen(false);
      };
      return h(
        Modal,
        {
          open,
          onClose: close,
          title: t("loginTitle"),
          closeLabel: t("close"),
          className: "tdocs-login-modal",
          backdropBlur: false,
        },
        h(LoginBody, { auth, t, login, retry }),
      );
    }

    function ToolboxPage({ useAuth, useTheme, login, retry, back, t }) {
      const auth = useAuth();
      const colorScheme = useTheme((value) => value.active.colorScheme);
      const frame = React.useRef(null);
      const syncTheme = React.useCallback(() => {
        const style = getComputedStyle(document.documentElement);
        const names = {
          "--ink": "--dsw-alias-label-primary",
          "--muted": "--dsw-alias-label-secondary",
          "--paper": "--dsw-alias-bg-base",
          "--white": "--dsw-alias-bg-layer-1",
          "--line": "--dsw-alias-border-l1",
          "--accent": "--dsw-alias-brand-primary",
          "--accent-light": "--dsw-alias-bg-layer-2",
        };
        const colors = Object.fromEntries(
          Object.entries(names)
            .map(([key, token]) => [key, style.getPropertyValue(token).trim()])
            .filter(([, value]) => value),
        );
        frame.current?.contentWindow?.postMessage(
          { type: "tdocs-toolbox-theme", colorScheme, colors },
          location.origin,
        );
      }, [colorScheme]);
      React.useEffect(syncTheme, [syncTheme]);
      return h(
        "section",
        { className: "tdocs-page", "data-tencent-docs-toolbox": true },
        h(
          "header",
          { className: "tdocs-page-header" },
          h("h2", null, t("title")),
          h(
            "div",
            { className: "tdocs-header-actions" },
            h(StateDot, { state: auth.authenticated ? "done" : "ongoing" }),
            h("span", null, t(auth.authenticated ? "ready" : "checking")),
            h(Button, { variant: "ghost", onClick: back }, t("back")),
          ),
        ),
        auth.authenticated
          ? h("iframe", {
              ref: frame,
              title: t("pageTitle"),
              className: "tdocs-frame",
              src: "/tencent-docs-toolbox/app/",
              allow: "microphone",
              onLoad: syncTheme,
            })
          : h(
              "div",
              { className: "tdocs-page-login" },
              h(LoginBody, { auth, t, login, retry }),
            ),
      );
    }

    function Configuration({ useAuth, login, retry, open, t }) {
      const auth = useAuth();
      return h(
        "div",
        { className: "tdocs-configuration" },
        h(LoginBody, { auth, t, login, retry }),
        auth.authenticated
          ? h(Button, { variant: "primary", onClick: open }, t("open"))
          : null,
      );
    }

    function PanelIcon({ size }) {
      return h(FileTypeIcon, { kind: "word", size });
    }

    const styles =
      ".tdocs-page{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}.tdocs-page-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 20px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}.tdocs-page-header h2{font-size:15px;font-weight:500;margin:0}.tdocs-header-actions{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--dsw-alias-label-secondary)}.tdocs-frame{border:0;display:block;width:100%;flex:1;min-height:0;background:var(--dsw-alias-bg-base)}.tdocs-login-modal{width:min(520px,calc(100vw - 32px))}.tdocs-login-body{display:flex;flex-direction:column;gap:16px;color:var(--dsw-alias-label-primary);font-size:13px}.tdocs-login-body p{margin:0;line-height:1.6}.tdocs-login-status{display:flex;align-items:center;gap:10px}.tdocs-secondary{color:var(--dsw-alias-label-secondary)}.tdocs-page-login{padding:32px;max-width:620px}.tdocs-configuration{display:flex;flex-direction:column;align-items:flex-start;gap:18px;padding:8px 0}";

    return {
      inject: [
        "slots",
        "locale",
        "connection",
        "layout",
        "theme",
        "configForms",
      ],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(namespace, { zh, en }));
        const t = ctx.locale.bind(namespace);
        const auth = createAuthSource(ctx.connection.rpc);
        ctx.effect(() => () => auth.dispose());
        ctx.effect(() => {
          const node = document.createElement("style");
          node.textContent = styles;
          document.head.appendChild(node);
          return () => node.remove();
        });
        const open = () => ctx.layout.selectPanel(panelId);
        const inject = () => ({
          t,
          login: auth.login,
          retry: auth.retry,
          open,
          back: () => ctx.layout.selectPanel(null),
          hooks: {
            auth,
            theme: {
              getSnapshot: () => ctx.theme.getTheme(),
              subscribe: (listener) => ctx.on("theme/change", listener),
            },
          },
        });
        ctx.slots.inject("sidebar.panellist", () =>
          ctx.slots.register(
            {
              name: "sidebar.panellist",
              id: panelId,
              order: 45,
              label: () => t("title"),
              locale: namespace,
            },
            PanelIcon,
          ),
        );
        ctx.slots.inject("main", () =>
          ctx.slots.register(
            { name: "main", key: panelId, locale: namespace, inject },
            ToolboxPage,
          ),
        );
        ctx.effect(() =>
          ctx.configForms.whileServed(["tencent-docs-toolbox"], () =>
            ctx.slots.inject("shell.overlay", () =>
              ctx.slots.register(
                {
                  name: "shell.overlay",
                  id: "tencent-docs-toolbox-login",
                  order: 45,
                  locale: namespace,
                  inject,
                },
                AutoLogin,
              ),
            ),
          ),
        );
        ctx.slots.inject("plugins.bundle.config", () =>
          ctx.slots.register(
            {
              name: "plugins.bundle.config",
              key: "dsh-tencent-docs-toolbox",
              label: () => t("title"),
              locale: namespace,
              inject,
            },
            Configuration,
          ),
        );
        ctx.effect(() => () => {
          if (ctx.layout.panelInfo.getSnapshot().activePanelId === panelId)
            ctx.layout.selectPanel(null);
        });
      },
    };
  },
});
