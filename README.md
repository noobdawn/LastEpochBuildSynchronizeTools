# Last Epoch 离线存档工坊 / Offline Workshop

在 [LastEpochTools](https://www.lastepochtools.com/planner/zh/) 配装，粘贴分享链接，在浏览器中将构筑应用到自己的离线存档，或生成专属掉落过滤器。支持右上角中英文切换，可部署为 GitHub Pages 静态网站。普通使用不需要 Python、油猴脚本或后端。

当前数据基准：**游戏 1.5.2.1（内部版本 1.5.2.2）、Steam build 25816319**。接受 1.5.x 配装，并逐项验证当前物品、节点和技能；未来游戏更新仍需复核数据。

## 使用

1. 退出游戏，另外备份 `Saves` 文件夹。
2. 在原站完成配装，点击“保存 / 分享”取得最新链接。
3. 载入角色文件 `1CHARACTERSLOT_BETA_*`。要编辑金币、材料、阵营时，同时载入对应赛季的 `STASH_CYCLE_*`；仓库页名称在 `STASH_CYCLE_*_TAB_*` 中。
4. 拖入角色后会直接显示“装备编辑”，可以选择当前装备、神像、祝福或背包物品，单独修改已验证的属性。需要应用原站构筑时，粘贴链接，进入“配装同步”，选择角色与同步范围，再应用。也可以仅使用“存档编辑”。
5. 检查“修改预览”，下载 ZIP。`modified/` 只包含改过的存档，`originals/` 包含所有载入文件的原文备份。
6. 保持游戏关闭，将 `modified/` 中需要的文件复制到原 `Saves` 目录，保留原始备份后进入离线角色检查。

Windows 存档位置：

```text
%USERPROFILE%\AppData\LocalLow\Eleventh Hour Games\Last Epoch\Saves
```

工具不会直接写入游戏目录。选择文件只是交给浏览器读取；存档不发往服务器或 LastEpochTools。只有分享码用于请求公开配装接口。关闭或刷新会清空工作区；仅语言偏好存于本机。原件与 `.bak` / `.json` 副本支持导入，但同一目标存档不能同时载入多个副本。

## 从 Build 构造过滤器

在分享链接输入框下选择“离线存档同步”或“构造过滤器”。过滤器流程无需载入任何存档：

1. **需求暗金**：确认配装需要的暗金与套装，也可搜索增补。
2. **高价值词缀**：确认核心词缀，并编辑神像需求。
3. **有效词缀**：选择其他对配装有用的词缀。
4. **隐藏类型**：勾选不需要的装备类型、职业神像或神像形状；支持一键选择其他职业神像。
5. **分组与导出**：四类固定装备规则分别设置显示、颜色和强调，下载 v9 XML。

普通装备固定分为“核心词缀崇高装备”“有效词缀崇高装备”“考虑打造装备”“开荒过渡装备”，各用一条多类型规则，不提供评分表、百分比门槛或动态装备组。高价值词缀计入有效数量一次，无效词缀不计分也不扣分。未命中四类的普通装备默认隐藏；解析不完整的配装会保守显示其他装备和神像。玩家在“隐藏类型”页手动勾选的类型最先隐藏，包含该类型的暗金、套装及配装需求。职业神像按实际底材区分，不会连带隐藏同形状的其他职业神像。

下载后从游戏物品过滤器菜单导入，或放入 `%USERPROFILE%\AppData\LocalLow\Eleventh Hour Games\Last Epoch\Filters`。页面与 XML 支持中英名称；全部 1,156 个词缀及 489 个独特物品的名称来自当前版本官方本地化表。暗金稀有度使用相对重抽参数，不代表市场价格或直接掉率。**已验证 XML 结构与匹配逻辑，尚未进行游戏内导入验收。**

详见 [研究与数据](docs/build-to-filter-research.md)。关闭或刷新页面也会清空尚未下载的过滤器配置。

## 当前功能

| 范围 | 支持内容 |
| --- | --- |
| 过滤器 | 五阶段价值池确认、四类固定装备规则、装备／职业神像隐藏选择、可调整显示样式、v9 XML 下载 |
| 配装 | 装备与神像祭坛、神像布局、祝福；普通、暗金、套装和传奇物品；已验证的封印/腐化词缀、传奇潜能及 Weaver 属性 |
| 单件编辑 | 读取原存档的物品与词缀名称，修改已有属性 Roll、词缀层级和支持的潜能；保留物品身份及未改的字节 |
| 技能 | 被动天赋、5 个技能专精、技能栏；按当前游戏数据验证节点上限、前置、职业及技能解锁 |
| 角色 | 名称、等级、经验、未分配天赋/技能点；可选择从配装同步职业、专精和等级 |
| 进度 | 已有时间线的稳定值、腐化，以及已有地下城/竞技场记录和统计 |
| 资源 | 金币、远古骨骸、已有碎片、材料、钥匙、编织回响和共鸣数量 |
| 阵营 | 已有阵营的经验、好感和等级，使用当前游戏的等级上限 |
| 文件 | 多存档、字段搜索、修改预览、单文件撤销、原文备份、ZIP 下载 |

资源和技能专有名称目前使用游戏英文数据，界面与字段说明支持中英文。等级、经验、阵营数值分别编辑；游戏可能按自身规则重算关联值。记录字段不会自动生成缺失的剧情、任务或时间线结构。

### 存档 → 原站配装 → 存档

LastEpochTools 原生支持导入离线角色文件。在“装备编辑”点击“导出到原站配装”，然后在原站点“导入”，选择下载的角色文件。调整后在原站保存/分享，带着新链接回到本工具同步。已有的原角色文件也可以直接通过原站导入。

“查看存档配装概览”在本工具内反向读取当前角色，是只读概览。分享格式不能保留全部存档专属信息，所以概览不会被当作普通分享构筑重新覆盖存档。未知物品明确显示为不支持，保留原始内容。外站自动填充没有已确认的公开接口；工具不会声称已将内容写入 LastEpochTools。

只想调一件装备时，直接使用单件编辑，可以保留它的个体编号、归属标记、其余属性与其他物品。**Roll 0–255 表示属性在自身最小值到最大值之间的位置，约对应 0–100%，不是属性的绝对面板数值。**要按实际属性数值完整配装，可使用原站的“实际值”显示。

转换边界：

- 织网者树保留原值，暂不导入。未知物品功能、毁坏物品、部分特殊暗金及未验证字段会阻止该次同步，不会悄悄丢弃。
- 分享数据未指定的物品 roll 使用中间值，新生成装备锻造潜能为 0，并设为不可交易。以页面同步提示为准。
- 勾选的装备、神像、祝福范围整体替换；原来穿着的物品不会移入背包，原始备份仍有它们。未勾选范围及背包等其他容器保留。
- 职业变更必须同时同步天赋、专精和技能栏。工具校验可用天赋点，不伪造任务奖励；低等级角色可能需要先调整等级或点数。
- 当前验证包括游戏原生序列化逻辑、真实存档副本字节往返、公开配装样例及浏览器流程。**尚未通过启动游戏载入生成存档进行验证。**

## 本地运行与构建

使用 Node.js 24：

Windows 可以直接双击 `Start-Workshop.cmd`，它会安装缺少的依赖并打开网页；使用期间保持窗口开启。也可以执行：

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。验证与构建：

```sh
npm test
npm run build
npm run preview
```

发布文件在 `dist/`，资源使用相对路径，支持 GitHub 项目子路径。请通过 HTTP 服务访问，不要直接双击 `index.html`。

## GitHub Pages

仓库已包含测试与部署工作流：

1. 在 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
2. 推送到 `main` / `master`，或在 Actions 中手动运行 **Deploy offline workshop to GitHub Pages**。
3. 成功后的访问地址显示在部署任务中。

参考 [GitHub 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。仅发布 `dist/`；`.local/`、测试存档、游戏文件和研究缓存都被排除。

## 维护

- `web/src/core/save.js`：EPOCH + JSON 无损读写、校验、差异与备份；大整数不经普通 JSON 数值转换。
- `web/src/core/items.js`：第 6 版物品字节编码，外层仍为 `formatVersion: 2`。
- `web/src/core/value-filter.js`：价值池分析、四类固定规则、类型隐藏与 XML 导出；`filter-workbench.js` 为五阶段界面。旧 `loot-filter.js` 行式接口保留供兼容和研究测试。
- `web/src/core/planner.js`：公开配装接口、版本与节点检查、选择性同步。
- `web/src/core/game-item-data.json` 和 `web/src/data/`：当前游戏必要数据事实。
- `tools/`：数据提取脚本。Python 仅用于维护，不是网站运行依赖。见 [维护说明](tools/README.md)。

旧 Python 和油猴源码保留作历史参考，不参与网页运行，未验证适用于当前游戏。网站未镜像、嵌入或执行原站前端脚本。LastEpochTools 与本项目相互独立，游戏名称及数据归原权利人所有。见 [依赖与数据来源](THIRD_PARTY.md)。

## English

Plan on LastEpochTools, import its share URL, then apply the build to an offline save in your browser. Alternatively, choose Create loot filter: confirm needed uniques, high-value affixes and useful affixes, select unwanted equipment types and class-specific idols, then style four fixed equipment categories and download XML. No save or score configuration is required. Selected hidden types take priority, including uniques and sets of those types. Remaining ordinary equipment is hidden by default; unresolved build targets retain a conservative fallback. All affix and unique labels include official Simplified Chinese and English. In-game XML import acceptance is still pending. Switch languages in the top-right corner. No Python, userscript or backend is needed to use the site.

Dropping a character also opens its equipment editor. Adjust a single item’s existing rolls, affix tiers and supported potential fields without rebuilding the whole loadout. Roll values 0–255 describe the position within each stat’s range, not an absolute stat number. To continue in the original planner, export the current character and select it through LastEpochTools’ native Import flow. The local reverse-build overview is read-only because the share format cannot preserve every save-specific property.

Load the character and optionally the matching season stash. Choose what to synchronize, review changes and download the ZIP. With the game closed, copy the required files from `modified/` into `Saves`, retaining `originals/`. Selected equipment ranges are replaced; old items remain in the backup, not in the inventory. Other fields and large integers are preserved. Saves never leave the browser; only the public build ID is sent to LastEpochTools.

Baseline: **game 1.5.2.1 / internal 1.5.2.2**, v6 items. Equipment, idols, blessings, passives, specializations, action bar, character values, existing resources, factions and progress records are supported. Unknown item features are rejected; the Weaver tree is preserved. Omitted rolls use midpoint values and new items have zero forging potential. Resource and skill proper names currently use English game data. Generated saves have not yet been loaded in the game as an acceptance test.

Use Node.js 24, `npm ci` and `npm run dev` locally. `npm test` and `npm run build` produce a checked static site in `dist/`. For GitHub Pages, choose GitHub Actions in Pages settings and run the included deployment workflow. See [maintenance notes](tools/README.md) for updating game data.
