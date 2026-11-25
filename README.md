# tome-skill

Agent Tome 的 skill。每个 skill 是 `skills/<名字>/`：`SKILL.md` 告诉 agent 怎么用，`scripts/` 是它跑的命令。skill 不在 Agent Tome 的应用里，也不在 `tomed` 里，不装 Agent Tome 也能单独用。

| skill | 做什么 |
| --- | --- |
| `tome-board` | 画板（Excalidraw）：在浏览器里和 agent 一起画，文件存在 Obsidian 卡片库里 |

## 安装

把 skill 的文件夹链接到 agent 放 skill 的地方（Claude Code 是 `~/.claude/skills/`）：

```sh
ln -s "$PWD/skills/tome-board" ~/.claude/skills/tome-board
```

`tome-board` 的页面要先构建一次（Node 20+）：

```sh
cd apps/board && npm ci --ignore-scripts && node build.mjs
```

## tome-board：画板

和 claude slides・claude design 同一种做法：`scripts/board.mjs` 是命令和本机服务（Node 20+，没有依赖），`scripts/editor/` 是页面（从 `apps/board` 构建，不进 git）。agent 跑 `open` 拿到地址交给人。

```sh
node skills/tome-board/scripts/board.mjs open          # 没在跑就启动，打印 {"url": "http://127.0.0.1:4740/", …}：画板库
node skills/tome-board/scripts/board.mjs open 流程图    # 这张画板的地址、文件、png；没有这张就给出页面上问要不要创建的地址
node skills/tome-board/scripts/board.mjs new 流程图     # 新建一张空的，并给出挂到卡片上的两行
node skills/tome-board/scripts/board.mjs list
node skills/tome-board/scripts/board.mjs stop
node skills/tome-board/scripts/board.mjs comments --wait        # 等人在页面上把评论发给 agent，打印那条评论后结束
node skills/tome-board/scripts/board.mjs comment-reply <id> "…"  # 回复（--resolve 同时关掉）；comment-resolve <id> 只关掉
```

- 卡片库：`--vault`，没给就按 `$TOME_BOARD_VAULT`、Agent Tome 设的卡片库（home 的 `config.json`）、当前文件夹往上找到的 Obsidian 库的顺序找。
- 文件：卡片库的 `Excalidraw/`（Obsidian 的 Excalidraw 插件设了别的文件夹就跟它走）里的 `<名字>.excalidraw.md`，和插件同一种格式，两边都能开。停笔 0.8 秒自动保存，同时在旁边写一张整张图的 `<名字>.png`（给 agent 看的）。
- agent 直接改 `.excalidraw.md` 里 ```json 的 elements，开着的页面马上换新，改过的元素描绿框（右上角「外部改了 N 处」点掉），⌘Z 能撤回；页面随后按自己的格式重写一遍并更新 png。
- 区域评论：页面右上角「评论」。先选中图形再点，或者点了之后拖一块区域・点一个图形，写要怎么改或提问。有 agent 在跑 `comments --wait` 时按钮是「发给 Agent」，那条评论（文字、区域、里面的图形、图形的截图）交给它；没有就只保存，agent 用 `comments` 读。agent 的回复显示在评论下面。评论不放在卡片库里，在 `~/.tome-board/comments/`。
- 画板库（`/`）：最近改过的在前，按名字搜，「新画板」。菜单（☰）里有「全部画板」「复制图片路径」「复制文件路径」。
- 一个卡片库一个进程，管这个库的全部画板。只听 127.0.0.1（默认 4740，被占就往上找）。只接受发给这台机器（`127.0.0.1`・`localhost`，端口不限：容器转发出来的端口可能不一样）的请求，别的网站的页面读不到也写不了；只碰画板文件夹里的 `.excalidraw.md`・`.excalidraw`・`.png`，写入是原子的、带 rev。
- 在跑的进程记在 `~/.tome-board/servers/<id>.json`（`$TOME_BOARD_HOME` 可以换地方）：`pid`・`url`・`port`・`root`・`kind: "board"`・`startedAt`，和 claude slides・design 写在各自文件夹里的 `.artifact-server.json` 同样的字段。Agent Tome 的「本机页面」靠它列出画板。脚本或页面更新后下一次 `open` 会换成新的进程。
- 测试：`cd apps/board && npm test`（文件格式・文字的翻译・服务的规则）。
- 第三方许可（Excalidraw、字体、依赖）在 `scripts/editor/THIRD_PARTY_LICENSES.txt`，画板库页面最下面有链接。不带 Mermaid 导入和协作。
