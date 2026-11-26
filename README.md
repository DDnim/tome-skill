# tome-skill

English · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

Skills for coding agents, made for Agent Tome and usable without it. Each skill is a folder `skills/<name>/`: `SKILL.md` tells the agent how to use it, and `scripts/` holds the commands it runs. A skill starts a small page on your own computer; the agent hands you the address, you work in the browser, and the agent reads what you did and answers.

| skill | what it does |
| --- | --- |
| `tome-board` | A drawing board (Excalidraw): you and the agent draw on the same board in the browser, and the file is kept in your Obsidian vault |
| `tome-md` | Markdown: read a file rendered in the browser, select a passage to comment on or ask about, and the agent answers in the thread and edits the file |
| `tome-design` | A design: artboards written as plain HTML, side by side on a canvas in the browser; comment on an element or an area, and the agent changes the files and replies |

## Install

Link the skill's folder into the place your agent reads skills from (for Claude Code, `~/.claude/skills/`):

```sh
ln -s "$PWD/skills/tome-board" ~/.claude/skills/tome-board
ln -s "$PWD/skills/tome-md" ~/.claude/skills/tome-md
ln -s "$PWD/skills/tome-design" ~/.claude/skills/tome-design
```

`tome-md` and `tome-design` need no build: once linked, they work. The page of `tome-board` is built once (Node 20+):

```sh
cd apps/board && npm ci --ignore-scripts && node build.mjs
```

## tome-board: the drawing board

![A comment on a region of the board is sent to the agent, which redraws that part and replies](docs/tome-board.gif)

*You comment on a region; the agent changes the drawing and replies in the thread.*

`scripts/board.mjs` is both the command and the local server (Node 20+, no dependencies). `scripts/editor/` is the page, built from `apps/board` and not kept in git. The agent runs `open` and gives you the address.

```sh
node skills/tome-board/scripts/board.mjs open            # starts it if needed; prints {"url": "http://127.0.0.1:4740/", …}: the list of boards
node skills/tome-board/scripts/board.mjs open flow       # that board's address, file and png; no such board: an address where the page asks whether to make it
node skills/tome-board/scripts/board.mjs new flow        # makes an empty board and prints the two lines that attach it to a note
node skills/tome-board/scripts/board.mjs list
node skills/tome-board/scripts/board.mjs stop
node skills/tome-board/scripts/board.mjs comments --wait         # waits until you send a comment to the agent, prints that comment and ends
node skills/tome-board/scripts/board.mjs comment-reply <id> "…"  # replies (--resolve also closes it); comment-resolve <id> only closes it
```

- **Vault**: `--vault`. Without it, the script looks at `$TOME_BOARD_VAULT`, then the vault Agent Tome is set to (`config.json` in its home), then the nearest Obsidian vault above the current folder.
- **Files**: `<name>.excalidraw.md` in the vault's `Excalidraw/` folder (or the folder the Obsidian Excalidraw plugin is set to). It is the plugin's own format, so Obsidian opens the same file. The page saves 0.8 seconds after you stop drawing, and writes a picture of the whole board beside it, `<name>.png`, for the agent to look at.
- **The agent draws** by editing the `elements` in the file's `json` block. An open page shows the change at once, with a green frame around what changed (dismiss it with "N changed from outside" at the top right), and ⌘Z undoes it. The page then writes the file again in its own form and renews the picture.
- **Comments on a region**: press Comment at the top right, with shapes selected, or then drag over an area or click a shape, and write what to change or ask. While an agent runs `comments --wait` the button reads "Send to Agent" and the comment goes to it (your words, the region, the shapes in it, a picture of those shapes). Otherwise the comment is only saved, and the agent reads it with `comments`. The agent's reply shows under the comment. Comments are kept in `~/.tome-board/comments/`, not in the vault.
- **The list of boards** (`/`): the last changed first, search by name, "New board". The menu (☰) has "All boards", "Copy picture path" and "Copy file path".
- **One process per vault**, serving all of its boards. It listens on 127.0.0.1 only (4740, or the next free port up) and answers only requests addressed to this computer (`127.0.0.1` or `localhost`, at any port, since a port forwarded out of a container may differ), so a page of another site can neither read nor write. It touches only `.excalidraw.md`, `.excalidraw` and `.png` files in the board folder; writes are atomic and carry a revision.
- **The running process** is noted in `~/.tome-board/servers/<id>.json` (`$TOME_BOARD_HOME` moves it): `pid`, `url`, `port`, `root`, `kind: "board"`, `startedAt`. Agent Tome lists the board among its local pages from this file. After the script or the page is updated, the next `open` replaces the old process.
- **Tests**: `cd apps/board && npm test` (the file format, the page's translations, the server's rules).
- **Third-party licenses** (Excalidraw, the fonts, the packages) are in `scripts/editor/THIRD_PARTY_LICENSES.txt`, linked at the foot of the list of boards. Mermaid import and collaboration are left out.

## tome-md: Markdown

![Selected text is sent to the agent with a comment; the agent rewrites the paragraph and replies, then answers a question about the whole file](docs/tome-md.gif)

*You select a passage and comment; the agent edits the file and replies. Then a question about the whole file.*

`scripts/md.mjs` is both the command and the local server (Node 20+, no dependencies). `scripts/page/` is the page: plain JavaScript, no build. Markdown is parsed by the copy of marked shipped beside it (its license: `scripts/page/vendor/marked.LICENSE.md`).

```sh
node skills/tome-md/scripts/md.mjs open notes.md       # starts it if needed; prints {"url": "http://127.0.0.1:4750/d/<id>", …}
node skills/tome-md/scripts/md.mjs open                # the page that lists the opened files
node skills/tome-md/scripts/md.mjs list
node skills/tome-md/scripts/md.mjs close notes.md      # takes it off the list (the file stays)
node skills/tome-md/scripts/md.mjs stop
node skills/tome-md/scripts/md.mjs comments --wait         # waits until you send a comment to the agent, prints that comment and ends
node skills/tome-md/scripts/md.mjs comment-reply <id> "…"  # replies (--resolve also closes it); comment-resolve <id> only closes it
```

- **The page reads the file and never writes it.** You edit it in your own editor, the agent edits the file directly. When the file changes the page shows it at once, with a green bar beside the new and rewritten blocks (dismiss it with "N changed" at the top right).
- **Comments**: select some text and press Comment, or write about the whole file in the box at the top of the panel. "Add note" keeps a comment without sending it. While an agent runs `comments --wait` there is also "Send to Agent", which hands it this comment together with the notes added before it on that file (your words, the selected text, its lines, the heading it is under). When no agent is waiting, notes are only saved, and the agent reads them with `comments`. The agent's reply shows under the comment.
- **Only files opened with `open`** are shown (`.md`, `.markdown`); the page has no way to open another file. Pictures show when they are files beside the Markdown file (in the same vault or repository, not in a hidden folder); pictures on the web are not loaded. HTML written in the file is shown as text, not run.
- **One process per computer.** It listens on 127.0.0.1 only (4750, or the next free port up) and, like the board, answers only requests addressed to this computer.
- **Its own notes** are all in `~/.tome-md/` (`$TOME_MD_HOME` moves it): the opened files, the running process (`servers/main.json`, `kind: "md"`), the comments.
- **Tests**: `cd apps/md && npm test`.

## tome-design: a design on a canvas

`scripts/design.mjs` is both the command and the local server (Node 20+, no dependencies). `scripts/page/` is the page: plain JavaScript, no build. A design is a folder: `design.json` places its artboards on the canvas, and each artboard is a plain HTML file in the folder.

```sh
node skills/tome-design/scripts/design.mjs new "Sign-in flow"     # makes designs/Sign-in flow/ with an empty design.json, opens it; prints {"url": "http://127.0.0.1:4760/d/<id>", …}
node skills/tome-design/scripts/design.mjs open "designs/Sign-in flow"   # --board Home.html: that board alone
node skills/tome-design/scripts/design.mjs open             # the page that lists the opened designs
node skills/tome-design/scripts/design.mjs check "designs/Sign-in flow"  # what is wrong in design.json and the boards' HTML; exits 1 while anything is
node skills/tome-design/scripts/design.mjs list
node skills/tome-design/scripts/design.mjs close "designs/Sign-in flow"
node skills/tome-design/scripts/design.mjs stop
node skills/tome-design/scripts/design.mjs comments --wait         # waits until you send a comment to the agent, prints that comment and ends
node skills/tome-design/scripts/design.mjs comment-reply <id> "…"  # replies (--resolve also closes it); comment-resolve <id> only closes it
```

- **The canvas**: every board at its own size, its name above it. Drag or scroll to move, pinch or ⌘ + scroll to zoom, F fits everything, 0 is 100%. Double-click a board to see it alone, at full length, with its links and scripts working (‹ › or ← → for the others, Esc back).
- **The agent writes the files** and the open page follows: a changed board reloads at once and is outlined in green (dismiss it with "N changed" at the top right). The page itself edits nothing.
- **Comments**: press Comment (or C), then click an element of a board or drag over an area of it, and write. "Add note" keeps it; "Send to Agent" (while an agent runs `comments --wait`) hands it over with the notes before it. The agent gets the board, the place in its px, and the element (a CSS path, its text and the start of its markup) or the elements in the area. The box at the top of the panel is about the whole design.
- **Boards run in a sandbox**: another origin for each, with no access to the page, to this server's calls or to the network. They load files from their own folder and Google Fonts only.
- **One process per computer.** It listens on 127.0.0.1 only (4760, or the next free port up) and answers only requests addressed to this computer. Its own notes are in `~/.tome-design/` (`$TOME_DESIGN_HOME` moves it): the opened designs, the running process (`servers/main.json`, `kind: "design"`), the comments.
- **Not the claude-design format**: its `.dc.html` files need that skill's runtime. A tome-design board is an ordinary HTML file you can also open on its own.
- **Tests**: `cd apps/design && npm test`.

## License

MIT, see [LICENSE](LICENSE).
