---
description: "在 DSH 中登录腾讯文档、处理文件并查询账号额度与任务结果。"
kind: "package-bundle"
---

# 腾讯文档工具箱

中文 | [English](README.en.md)

## 简介

在 DSH 侧栏打开腾讯文档工具箱，处理 PDF、Office、图片、音视频及 AI 文档。Agent 可调用 43 项目录工具和 5 项管理工具，共 48 个工具。网页与 Agent 共用登录账号、文件和任务记录。

## 安装

需要 Node.js 24.15+、Google Chrome 和启用 Web 客户端的 DSH。Chrome 登录窗口在 DSH 服务所在电脑打开。

将 `<profile>` 替换为使用中的 DSH profile，将 `<commit>` 替换为本仓库已发布的完整 Git 提交 SHA，再安装固定版本。

```sh
dsh plugin --profile <profile> add "github:vb2250158/dsh-tencent-docs-toolbox#<commit>"
```

按 DSH 安装结果完成应用或重启，打开侧栏的“腾讯文档工具箱”。插件同时提供设置页中的登录状态和工具箱入口。

## 首次登录

插件先检查已保存的会话。需要登录时自动打开 Chrome，使用自己的 QQ 或微信完成腾讯文档登录。验证账号额度后，插件自动保存会话、关闭登录窗口，并继续等待中的工具调用。

默认以只读方式复用独立工具箱保存的登录。独立工具箱目录由 `TDOCS_PROXY_STATE_DIR` 指定，Windows 默认位于 `%LOCALAPPDATA%/tencent-docs-web-proxy`。新登录使用插件运行目录中的独立 Chrome 配置，Windows 会话通过当前用户的 DPAPI 加密保存。后续启动自动检查并复用已保存的会话。

关闭 Chrome 登录窗口会结束本轮登录等待。需要继续时，在登录面板选择“打开登录页面”。暂时无法联网时，面板提供重试入口并保留已保存的登录。

## 使用与工具范围

网页提供分类、搜索、上传、参数、进度及结果下载。Agent 的 5 项管理工具为 `tencent_docs_status`、`tencent_docs_catalog`、`tencent_docs_limits`、`tencent_docs_upload` 和 `tencent_docs_job`。43 项操作使用 `tencent_docs_<tool-id>` 命名，上传返回的 artifact ID 可作为任务输入。

工具返回持久任务编号。`completed` 表示已取得结果，`user_action_required` 表示需要进入原生编辑器、服务商授权页面或签署流程。响应丢失时，使用原 `requestId` 和任务编号核对结果后继续。

智能翻译、简历美化和图片转简历提供原生编辑器接续。7 项第三方服务提供服务商信息、授权状态和原生入口，覆盖简历范文、简历分析、证件照、草料二维码、魔法擦除、抠图及电子合同。相关编辑、授权和签署由用户在对应界面完成。逐项说明见后端工具清单。[工具清单](https://github.com/vb2250158/tencent-docs-web-proxy/blob/main/docs/toolbox.md)

## 额度

工具箱读取当前账号的文档 AI 积分、Buddy One 积分和音视频转写时长。积分保留上游返回的小数精度，语音速记与音视频转文字共用权益编号 25，时长余额按秒读取。明确返回 `unlimit=true` 的账号权益显示无限量，本地处理单独标明本地操作额度和文件限制。

未取得的余额显示未获取，未返回的独立额度按未知状态显示。文件大小、格式、页数和会员规则同时受工具限制及上游检查约束。

## 配置与生命周期

插件包含共享运行库 v0.3.0 的固定公开快照，来源和逐文件哈希保存在 `runtime/source.json`。维护者可运行 `npm run sync-runtime -- <上游仓库路径>` 重建该快照。

`npm run build` 生成随包发布的 Host 产物，并打包 COS SDK 的 JavaScript 依赖以兼容 DSH。原始共享快照保持可核对，构建来源、适配器哈希和依赖许可证保存在 `lib`。

在 DSH 中配置 `tencent-docs-toolbox` 插件行。内嵌页面通过 DSH 的 owner 连接访问。

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| `dataDirectory` | `$DSH_HOME/state/tencent-docs-toolbox` | 私有会话、独立 Chrome 配置、文件和任务目录。`DSH_HOME` 缺省为 `~/.dsh`，自定义目录应位于源码仓库之外。 |
| `reuseStandaloneLogin` | `true` | 允许读取本机独立工具箱已保存的登录。设为 `false` 后使用插件自己的会话及登录窗口。 |

并发调用共用一个登录窗口，取消单个工具等待只结束该调用的等待。登录续期复用当前工具服务和任务记录。卸载插件会撤销工具、页面及路由注册，关闭私有后端和登录窗口，并等待已接收任务收尾。历史文件、会话及任务记录保存在私有运行目录，由该目录统一管理。

## 许可证

MIT。腾讯文档及相关商标归各自权利人所有。[许可证](LICENSE)
