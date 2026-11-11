---
description: "Sign in to Tencent Docs in DSH, process files, and check account limits and task results."
kind: "package-bundle"
---

# Tencent Docs toolbox

[中文](README.md) | English

## Summary

Open the Tencent Docs toolbox from the DSH sidebar to process PDFs, Office files, images, audio, video, and AI documents. Agents receive 43 catalogue operations and 5 management tools, for 48 tools in total. The page and Agent share the account, files, and task records.

## Install

Use Node.js 24.15+, Google Chrome, and DSH with its Web client enabled. The Chrome sign-in window opens on the computer running the DSH service.

Replace `<profile>` with your active DSH profile and `<commit>` with a published full Git commit SHA from this repository, then install that fixed version.

```sh
dsh plugin --profile <profile> add "github:vb2250158/dsh-tencent-docs-toolbox#<commit>"
```

Apply or restart as directed by the DSH installation result, then open “Tencent Docs toolbox” in the sidebar. The plugin also provides sign-in status and a toolbox entry in settings.

## First sign-in

The plugin checks saved credentials first. When sign-in is required, it opens Chrome automatically. Sign in to your own Tencent Docs account with QQ or WeChat. After validating account quota, the plugin saves the session, closes the sign-in window, and resumes waiting tool calls.

By default, the plugin reuses an existing standalone toolbox session with read-only access. `TDOCS_PROXY_STATE_DIR` selects the standalone directory, which defaults to `%LOCALAPPDATA%/tencent-docs-web-proxy` on Windows. A new sign-in uses a dedicated Chrome profile in the plugin runtime directory. On Windows, session cookies are encrypted with the current user's DPAPI. Later starts check and reuse the saved session automatically.

Closing the Chrome sign-in window ends the current login wait. Select “Open sign-in page” in the login panel to continue. When the connection is unavailable, the panel offers a retry action and retains the saved sign-in.

## Use and tool scope

The page provides categories, search, uploads, parameters, progress, and result downloads. The 5 Agent management tools are `tencent_docs_status`, `tencent_docs_catalog`, `tencent_docs_limits`, `tencent_docs_upload`, and `tencent_docs_job`. The 43 operations use `tencent_docs_<tool-id>` names. An upload returns an artifact ID for task input.

Tools return a durable job ID. `completed` confirms an output. `user_action_required` directs the user to a native editor, provider authorization page, or signing flow. After a lost response, reconcile the original `requestId` and job ID before continuing.

Smart translation, resume beautification, and image-to-resume provide a native editor continuation. Seven third-party services expose provider information, authorization status, and native entry points for resume samples, resume analysis, ID photos, CaoLiao QR codes, magic erasing, smart cutout, and electronic contracts. The user completes the relevant editing, authorization, and signing in the corresponding interface. The backend catalogue describes each operation. [Tool catalogue](https://github.com/vb2250158/tencent-docs-web-proxy/blob/main/docs/toolbox.md)

## Account limits

The toolbox reads the current account's document AI points, Buddy One points, and transcription time. Points retain the decimal precision returned upstream. Voice notes and audio/video transcription share entitlement ID 25, with time balances read in seconds. Account rights that explicitly return `unlimit=true` display an unlimited allowance. Local processing separately identifies its local operation allowance and file limits.

Unavailable balances display an unavailable state, and absent independent allowances display an unknown state. File size, format, page count, and membership rules remain subject to tool limits and upstream checks.

## Configuration and lifecycle

The plugin includes a fixed public snapshot of shared runtime v0.3.0. Its source revision and file hashes are recorded in `runtime/source.json`. Maintainers can reproduce it with `npm run sync-runtime -- <upstream-checkout>`.

Configure the `tencent-docs-toolbox` plugin row in DSH. The embedded page uses the DSH owner connection for access.

| Setting | Default | Purpose |
| --- | --- | --- |
| `dataDirectory` | `$DSH_HOME/state/tencent-docs-toolbox` | Private session, dedicated Chrome profile, file, and task directory. `DSH_HOME` defaults to `~/.dsh`. Choose a custom directory outside source repositories. |
| `reuseStandaloneLogin` | `true` | Read an existing local standalone toolbox session. Set to `false` to use the plugin's own session and sign-in window. |

Concurrent calls share one sign-in window. Cancelling one tool wait ends that caller's wait. Session renewal reuses the current toolbox service and job records. Unloading the plugin removes its tool, page, and route registrations, closes the private backend and login window, and drains accepted jobs. Historical files, sessions, and job records are managed in the private runtime directory.

## License

MIT. Tencent Docs and related trademarks belong to their respective owners. [License](LICENSE)
