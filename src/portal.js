import { request as httpRequest } from "node:http";
import { createProxyServer } from "tencent-docs-web-proxy/server";
import { TranscriptionService } from "tencent-docs-web-proxy/transcription";

const PREFIX = "/tencent-docs-toolbox";
const APP = `${PREFIX}/app`;

function send(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

/** One private backend instance; DSH remains the sole public HTTP authentication owner. */
export function createPortal(session, root, logger) {
  let server;
  let starting;
  let disposed = false;
  const requests = new Set();

  async function backend() {
    if (disposed) throw new Error("Plugin disposed");
    if (server) return server;
    starting ??= (async () => {
      const toolbox = session.getToolbox();
      const transcription = new TranscriptionService(session.client, root);
      transcription.toolbox = toolbox;
      const candidate = createProxyServer(transcription, {
        root,
        basePath: APP,
        embedded: true,
        logger: (event) => logger?.debug?.("toolbox request", event.code),
      });
      await new Promise((resolve, reject) => {
        candidate.once("error", reject);
        candidate.listen(0, "127.0.0.1", resolve);
      });
      if (disposed) {
        await new Promise((resolve) => candidate.close(resolve));
        throw new Error("Plugin disposed");
      }
      server = candidate;
      return server;
    })();
    try {
      return await starting;
    } catch (error) {
      starting = undefined;
      throw error;
    }
  }

  function handler(connection) {
    return async (request, response) => {
      const admission = connection.admit(request);
      if ("rejection" in admission) {
        response.writeHead(admission.rejection);
        response.end();
        return;
      }
      if (admission.peer.principal.kind !== "owner") {
        response.writeHead(403);
        response.end();
        return;
      }
      const url = new URL(request.url, "http://localhost");
      // Retain the browser's origin check before forwarding under the loopback Host.
      if (request.headers.origin) {
        let origin;
        try {
          origin = new URL(request.headers.origin);
        } catch {
          response.writeHead(403);
          response.end();
          return;
        }
        if (
          origin.host !== request.headers.host ||
          !["http:", "https:"].includes(origin.protocol)
        ) {
          response.writeHead(403);
          response.end();
          return;
        }
      }
      if (url.pathname === APP || url.pathname.startsWith(`${APP}/`)) {
        try {
          await session.initialize();
          if (!session.status().authenticated) {
            send(response, 401, {
              error: {
                code: "LOGIN_REQUIRED",
                message: "请在腾讯文档登录窗口完成登录",
              },
            });
            return;
          }
          const target = await backend();
          const headers = { host: `127.0.0.1:${target.address().port}` };
          for (const key of [
            "content-type",
            "content-length",
            "accept",
            "idempotency-key",
          ])
            if (request.headers[key] !== undefined)
              headers[key] = request.headers[key];
          const upstream = httpRequest(
            {
              host: "127.0.0.1",
              port: target.address().port,
              path: `${url.pathname.slice(APP.length) || "/"}${url.search}`,
              method: request.method,
              headers,
            },
            (incoming) => {
              response.writeHead(incoming.statusCode, incoming.headers);
              incoming.on("error", () => response.destroy());
              incoming.pipe(response);
            },
          );
          requests.add(upstream);
          upstream.once("close", () => requests.delete(upstream));
          upstream.on("error", () => {
            if (!response.headersSent)
              send(response, 503, {
                error: {
                  code: "TOOLBOX_UNAVAILABLE",
                  message: "工具箱连接未完成，请重试",
                },
              });
            else response.destroy();
          });
          response.once("close", () => {
            if (!response.writableEnded) upstream.destroy();
          });
          request.pipe(upstream);
        } catch {
          send(response, 503, {
            error: {
              code: "TOOLBOX_UNAVAILABLE",
              message: "工具箱暂未就绪，请重试登录状态",
            },
          });
        }
        return;
      }
      let rpcId = "";
      try {
        if (
          request.method !== "POST" ||
          !request.headers["content-type"]?.startsWith("application/json")
        ) {
          response.writeHead(405);
          response.end();
          return;
        }
        const chunks = [];
        let bytes = 0;
        for await (const chunk of request.iterator({
          destroyOnReturn: false,
        })) {
          bytes += chunk.length;
          if (bytes > 4096) {
            request.resume();
            throw new Error("Request too large");
          }
          chunks.push(chunk);
        }
        const envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const method = url.pathname.slice(`${PREFIX}/`.length);
        if (
          envelope.type !== "client-request" ||
          typeof envelope.rpcId !== "string" ||
          envelope.method !== method ||
          !["status", "login", "retry"].includes(method)
        )
          throw new Error("Invalid RPC");
        rpcId = envelope.rpcId;
        await session.initialize();
        if (method === "login") void session.startLogin().catch(() => {});
        if (method === "retry") void session.whenReady().catch(() => {});
        send(response, 200, {
          type: "server-response",
          rpcId,
          result: { ok: true, value: session.status() },
        });
      } catch {
        send(response, 200, {
          type: "server-response",
          rpcId,
          result: {
            ok: false,
            error: {
              code: "TOOLBOX_REQUEST_FAILED",
              message: "读取工具箱状态未完成，请重试",
              details: {},
            },
          },
        });
      }
    };
  }

  return {
    handler,
    async dispose() {
      disposed = true;
      for (const request of requests) request.destroy();
      await starting?.catch(() => {});
      if (server) await new Promise((resolve) => server.close(resolve));
    },
  };
}
