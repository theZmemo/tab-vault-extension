# Chrome Web Store 发布资料

版本：0.0.11

产品主页：`https://tidr.dev/xxx`

## 单一用途

帮助用户在本地保存、整理、搜索、休眠、归档和恢复浏览器标签。

上述能力均属于浏览器标签管理这一项单一用途，不包含广告、网页内容注入、搜索引擎替换、账号体系或无关功能。

## 商店摘要

### 中文

在本地保存、分组、搜索、去重、休眠和恢复浏览器标签，降低标签堆积造成的内存占用和资料丢失风险。

### English

Save, organize, search, deduplicate, sleep, and restore browser tabs locally.

## 详细说明

### 中文

标签资产库是一款本地优先的浏览器标签管理扩展。它将网页记录与浏览器中的真实标签分离，让用户可以在不丢失 URL、标题、分组和会话结构的前提下释放内存或关闭标签。

主要功能：

- 自动保存标签 URL、标题、窗口位置和状态。
- 永久分组、20 种颜色、规则分类和组内移动。
- 中文子串、标题、URL、域名和备注搜索。
- 规范化 URL 去重，合并常见跟踪参数造成的重复记录。
- 四级渐进式休眠，按当前窗口、所有窗口、强力模式和本地占位页深度休眠逐级增强。
- 深度休眠前先保存原 URL，并处理所有可操作网页标签，包括活动、固定、有声、加载中和已原生休眠标签；已保护资源和浏览器内部页除外。首次使用会提示页面运行时状态会被中断。
- 更新或重新加载扩展时，深度休眠恢复记录可自动重建被 Chrome 关闭的本地占位标签及其原生标签组。
- 安全归档，在本地写入成功后才关闭真实标签。
- 自动及手动会话快照，并按窗口、顺序和标签组恢复。
- JSON 备份导出、校验和合并导入。
- 自动适配简中、繁中、英、日、韩、西、法、德、葡、俄语及系统深浅色模式。

隐私说明：

- 数据仅保存在当前浏览器的 IndexedDB 中。
- 不采集网页正文、Cookie、密码或表单内容。
- 不包含广告、分析 SDK、跟踪 SDK 或远程代码。
- 不向开发者或第三方传输标签和浏览数据。

### English

Tab Vault is a local-first browser tab manager. It separates saved page records
from live browser tabs so users can release memory or close tabs without losing
their URLs, titles, groups, and session structure.

Key features:

- Automatically saves tab URLs, titles, window positions, and states.
- Permanent groups, 20 colors, deterministic rules, and group management.
- Search across custom names, titles, URLs, domains, and notes.
- Normalized URL deduplication for common tracking parameters.
- Four progressive sleep levels for the current window, all windows, broader
  manual coverage, or placeholder-based deep sleep.
- Deep sleep persists the original URL before replacing all browser-operable
  web tabs, including active, pinned, audible, loading, and natively discarded
  tabs. Protected resources and browser-internal pages remain excluded.
- Safe archiving that persists data before closing live tabs.
- Automatic and manual session snapshots with window and tab-group restoration.
- Validated JSON backup export, import, and merge.
- Browser-language localization for ten languages and automatic light or dark
  appearance.

Privacy:

- Data stays in the current browser's IndexedDB database.
- No page body content, cookies, passwords, or form values are collected.
- No ads, analytics SDKs, tracking SDKs, or remote code are included.
- Tab and browsing data is not transmitted to the developer or third parties.

## 权限理由

| 权限 | 提交说明 |
|---|---|
| `alarms` | 定时执行用户配置的闲置标签休眠和本地会话快照。 |
| `contextMenus` | 允许用户从浏览器右键菜单把当前标签加入永久分组或打开管理界面。 |
| `sidePanel` | 在 Chrome 原生侧边栏中提供扩展的主要管理界面。 |
| `tabGroups` | 读取标签组元数据，并在恢复会话快照时重建标签组。 |
| `tabs` | 读取标签 URL、标题和状态，并执行用户请求的聚焦、原生休眠、深度休眠占位替换、关闭和恢复操作。 |
| `unlimitedStorage` | 将大量标签资源、分组和会话快照长期保存在本机 IndexedDB，避免浏览器配额导致资产丢失。 |

扩展不申请主机权限，不注入内容脚本，不读取网页正文。

## 隐私权规范

- 单一用途：使用本页“单一用途”文本。
- 远程代码：选择“否，我没有使用远程代码”。
- 数据类型：披露“网络历史记录 / Web history”。
- 数据用途：仅用于标签管理这一核心功能。
- 数据出售：否。
- 广告用途：否。
- 信用或贷款用途：否。
- 向第三方传输：否。
- 人工读取：否。
- 隐私政策 URL：
  `https://github.com/theZmemo/tab-vault-extension/blob/main/PRIVACY.md`

## 商品链接

- 首页：`https://github.com/theZmemo/tab-vault-extension`
- 支持：`https://github.com/theZmemo/tab-vault-extension/issues`
- 隐私政策：`https://github.com/theZmemo/tab-vault-extension/blob/main/PRIVACY.md`

## 图片资源

| 资源 | 要求 | 状态 |
|---|---|---|
| 商店图标 | 128x128 PNG | 已有 `public/icons/icon-128.png` |
| 截图 | 至少 1 张 1280x800 或 640x400，最多 5 张 | 已生成 `store-assets/screenshot-*.png` |
| 小宣传图 | 440x280 PNG/JPEG | 已生成 `store-assets/small-promo-440x280.png` |
| 滚动宣传图 | 1400x560 PNG/JPEG | 可选 |

截图必须来自当前版本真实界面，不包含用户真实 URL、标题或其他敏感数据。

## 提交前清单

- [ ] Google 开发者账号已启用两步验证。
- [ ] 联系邮箱已验证。
- [ ] 发布商名称和商家/非商家身份已确认。
- [ ] `npm run verify:store` 通过。
- [ ] 使用全新 Chrome 配置手动完成安装、分组、休眠、归档、恢复和备份回归。
- [ ] 上传包根目录直接包含 `manifest.json`。
- [ ] 商店中英文说明与本文件一致。
- [ ] 隐私权规范与 `PRIVACY.md` 一致。
- [ ] 隐私政策 URL 已公开访问。
- [ ] 截图来自 0.0.11 最新界面且尺寸合规。
- [ ] 权限理由逐项填写，无额外权限。
- [ ] 初次发布先选择“未公开”完成审核验证，再切换公开范围。
