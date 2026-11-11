import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { listToolCatalog } from "tencent-docs-web-proxy/catalog";

const output = {
  schema: { type: "object", additionalProperties: true },
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
};
const parameters = (properties) => ({
  type: "object",
  properties,
  additionalProperties: false,
});

/** Use the same jobs and account as the plugin's WebGUI; login never appears as model-visible credentials. */
export function createTools(session) {
  const definitions = [
    {
      name: "tencent_docs_status",
      description:
        "Read Tencent Docs sign-in status without returning cookies or credentials.",
      parameters: parameters({}),
      execute: async () => {
        await session.initialize();
        return session.status();
      },
    },
    {
      name: "tencent_docs_catalog",
      description:
        "List Tencent Docs toolbox operations and their validation state.",
      parameters: parameters({}),
      execute: async () => listToolCatalog(),
    },
    {
      name: "tencent_docs_limits",
      description:
        "Read live Tencent Docs/Buddy One points, shared audio quota, explicit unlimited entitlements and per-tool file limits. Opens sign-in only when needed.",
      parameters: parameters({}),
      execute: async (_args, exec) =>
        (await session.whenReady(exec.signal)).limits.refresh(),
    },
    {
      name: "tencent_docs_job",
      description:
        "Query an original toolbox job and retrieve confirmed outputs without resubmitting it.",
      parameters: {
        ...parameters({ jobId: { type: "string" } }),
        required: ["jobId"],
      },
      execute: async (args, exec) =>
        (await session.whenReady(exec.signal)).status(args.jobId),
    },
    {
      name: "tencent_docs_upload",
      description:
        "Upload a user-selected local input into the private toolbox artifact store. Use only files authorized by the user. Returns an artifact ID.",
      parameters: {
        ...parameters({ path: { type: "string" }, name: { type: "string" } }),
        required: ["path"],
      },
      execute: async (args, exec) =>
        (await session.whenReady(exec.signal)).artifacts.importFile(
          args.path,
          args.name || basename(args.path),
        ),
    },
    ...listToolCatalog().tools.map((tool) => ({
      name: `tencent_docs_${tool.id}`,
      description: `${tool.titleEn || tool.title}. Returns a durable toolbox job. Only completed confirms an output. user_action_required means native editing, provider authorization or signing remains. Reuse requestId to reconcile a lost response.`,
      parameters: parameters({
        artifacts: { type: "array", items: { type: "string" } },
        options: { type: "object", additionalProperties: true },
        requestId: { type: "string" },
      }),
      execute: async (args, exec) =>
        (await session.whenReady(exec.signal)).run(
          tool.id,
          { artifacts: args.artifacts || [], options: args.options || {} },
          args.requestId || randomUUID(),
        ),
    })),
  ];
  return definitions.map((tool) => ({
    ...tool,
    output,
    presentCall: () => ({
      card: "generic",
      title: tool.name.replace("tencent_docs_", "Tencent Docs · "),
      kind: [
        "tencent_docs_status",
        "tencent_docs_catalog",
        "tencent_docs_limits",
        "tencent_docs_job",
      ].includes(tool.name)
        ? "read"
        : "other",
    }),
  }));
}
