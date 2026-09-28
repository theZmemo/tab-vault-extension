# Tab Vault Privacy Policy

Effective date: September 28, 2026

Tab Vault is a local-first browser tab manager. Its single purpose is to help
users save, organize, search, sleep, archive, and restore their browser tabs.

## Data Handled

To provide that purpose, the extension reads and stores:

- Tab URLs, page titles, domain names, and tab positions.
- Tab state such as active, pinned, audible, discarded, deep sleeping, window,
  and group.
- Visit timestamps and locally calculated visit counts.
- Names, notes, rules, groups, and settings entered by the user.
- Session snapshots created automatically or manually.

Tab Vault does not read or store page body content, cookies, passwords, form
values, authentication credentials, personal communications, financial
information, or precise location.

## Use of Data

The data is used only to provide the extension's tab-management features:
local search, deduplication, grouping, sleeping, archiving, session snapshots,
and restoration.

For user-initiated deep sleep, the original page URL is stored in IndexedDB and
redundantly encoded in the fragment of a packaged local placeholder URL. This
fragment stays inside the browser and is used only to restore that tab. Deep
sleep does not capture page content, form values, or in-page runtime state.

## Storage and Transmission

All extension data is stored locally in the browser's IndexedDB database.
Tab Vault does not operate a backend service and does not transmit user data,
analytics, diagnostics, or browsing activity to the developer or third
parties.

The extension contains no advertising, analytics SDK, tracking SDK, or remote
code. It does not sell, rent, share, or use user data for advertising, credit,
or profiling.

## Backups

Users can explicitly export a JSON backup. The backup can contain tab URLs,
titles, groups, rules, settings, and session snapshots. The exported file is
saved to a location chosen by the browser and remains under the user's
control. Import occurs only when the user selects a backup file.

## Retention and Deletion

Saved resources remain in the local database so they can be searched and
restored. Local operation event records are automatically removed after the
configured retention period. Users can permanently delete an archived resource
from the extension, including its group relationships, event records, and
session snapshot entries. Users can remove all local extension data by
uninstalling Tab Vault or clearing the extension's site data in Chrome.

## Incognito Browsing

Tab Vault does not run in Incognito mode and does not collect Incognito tab
information.

## Chrome Web Store Limited Use

The use of information received from Chrome APIs adheres to the Chrome Web
Store User Data Policy, including the Limited Use requirements. User data is
used only to provide or improve Tab Vault's disclosed single purpose.

## Changes

If data practices change, this policy and the in-product disclosure will be
updated before the changed practice is released.

## Contact

For privacy questions, contact: zhyp@useai.tech

---

# 标签资产库隐私政策

生效日期：2026 年 9 月 28 日

标签资产库是一款本地优先的浏览器标签管理扩展，唯一用途是帮助用户保存、整理、搜索、休眠、归档和恢复浏览器标签。

## 处理的数据

为实现上述用途，扩展会读取并保存：

- 标签 URL、网页标题、域名和标签位置。
- 活动、固定、有声、原生休眠、深度休眠、窗口和标签组等标签状态。
- 访问时间和本地计算的访问次数。
- 用户填写的名称、备注、规则、分组和设置。
- 自动或手动创建的会话快照。

扩展不会读取或保存网页正文、Cookie、密码、表单内容、身份验证凭据、私人通信、财务信息或精确位置。

## 数据用途

这些数据仅用于提供本扩展的标签管理功能，包括本地搜索、去重、分组、休眠、归档、会话快照和恢复。

用户主动执行深度休眠时，原网页 URL 会保存在 IndexedDB 中，并冗余编码到扩展本地占位页 URL 的片段中。该片段仅保留在浏览器内，只用于恢复对应标签。深度休眠不会采集网页正文、表单内容或网页应用内的运行时状态。

## 存储与传输

所有扩展数据仅保存在当前浏览器的 IndexedDB 中。标签资产库没有后端服务，不会向开发者或第三方传输用户数据、分析数据、诊断数据或浏览活动。

扩展不包含广告、分析 SDK、跟踪 SDK 或远程代码，不会出售、出租、共享用户数据，也不会将其用于广告、征信或用户画像。

## 备份

只有用户主动操作时才会导出 JSON 备份。备份可能包含标签 URL、标题、分组、规则、设置和会话快照，由浏览器保存到用户选择的位置并由用户自行保管。导入仅在用户主动选择备份文件后执行。

## 保留与删除

资源记录会保留在本地数据库中，以便搜索和恢复。本地操作事件记录会在配置的保留期后自动删除。用户可以在扩展中永久删除已归档资源，并同步清理其分组关系、事件记录和会话快照条目。用户也可通过卸载标签资产库或清除 Chrome 中该扩展的站点数据，删除全部本地数据。

## 无痕浏览

标签资产库不在无痕模式中运行，也不会收集无痕标签信息。

## Chrome 应用商店有限使用

从 Chrome API 获取的信息将遵守 Chrome 应用商店用户数据政策及其有限使用要求。用户数据仅用于提供或改进标签资产库已披露的单一用途。

## 政策变更

如果数据处理方式发生变化，扩展会在发布变更前同步更新本政策和产品内披露。

## 联系方式

隐私问题请联系：zhyp@useai.tech
