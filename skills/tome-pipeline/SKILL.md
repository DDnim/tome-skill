---
name: tome-pipeline
description: >-
  Design, build and run a pipeline: a folder whose pipeline.json lists steps (a script, a prompt for an
  agent, or a question for a person) with what each needs and makes. A run carries it from start to end
  in order, side by side where it can, with retries and time limits, takes a step whose inputs did not
  change from an earlier run, and records every step's log and files in runs/<time>/; resume carries a
  failed or waiting run on. A local page in the browser draws the steps colored by their state and shows
  each one's log and files, and takes a person's answer. Use when the user asks to design or build a
  pipeline, a workflow of steps, a production line, a batch job to run on a schedule, 流水线, 工作流,
  パイプライン, names tome-pipeline, or wants to change or run a folder that holds pipeline.json. Not for
  data warehouse transforms (dbt: tome-etl), not a scheduler, not a service that stays running.
---

# Pipeline: a folder of steps

A pipeline is a folder. `pipeline.json` lists its steps: what each does, what it needs, which files it makes.
Each step is a script in `steps/`, a prompt for an agent in `steps/`, or a question for a person. This skill's
script runs it (`run`), carries an unfinished run on (`resume`), and serves a page on this computer that draws
the steps and shows each one's state, log and files.

The script carries one run and ends. It is not a scheduler and not a daemon: something else starts it on a
schedule (Bot Tome, launchd, cron, CI), and something else reads how it ended (its exit code and last line).

Tell the user what happens, never the mechanism.

## The calls

`node <this skill's folder>/scripts/pipeline.mjs <command>` (Node 20+), `pipeline.mjs` below.

- `new "<title>"` → makes `./pipelines/<title>/` (`--in <dir>`: under that folder) with a `pipeline.json` that
  has no steps, an empty `steps/`, and a `.gitignore` that leaves `runs/` out; opens the page; prints
  `{url, root, index, …}`.
- `check "<folder>"` → `{problems, todo}`: what is wrong in `pipeline.json`, and which steps' files are not
  written yet. Exits 1 while there are problems (todo is fine while designing).
- `run "<folder>"` → one run in a new `runs/<time>/`. Prints a line per step and ends with one line (below).
  `--all`: run every step, take none from earlier runs. `--only <step>`: that step alone, what it needs taken
  from the latest runs that have it (to try a step while building it).
- `resume "<folder>"` → carries the latest run on in its own folder: done steps stay, failed / waiting /
  unreached ones run. `--from <step>`: run that step and every step after it again. `--run <name>`: that run.
- `answer "<folder>" <step> "<text>"` → answers a human step that waits (`-`: the text on stdin). `--resume`
  carries the run on right after.
- `status "<folder>"` → the latest run's state and each step's.
- `schedule "<folder>" --cron "0 6 * * *"` → prints the command a scheduled job runs, and a crontab line. Writes
  nothing.
- `open "<folder>"` → starts the page (once; later calls reuse it) and prints `url`,
  `http://127.0.0.1:4780/p/<id>`. `open` alone: the list. `list`, `close "<folder>"`, `stop`.

`run` and `resume` end with one line, and exit with a code:

| last line | exit | meaning |
| --- | --- | --- |
| `DONE <title> · run <name>` | 0 | every step done |
| `FAIL <title> · run <name> · <step> · <why> · log <path> · after fixing: … resume …` | 1 | a step failed after its retries |
| `WAIT <title> · run <name> · <step> waits for a person: <question> · answer: …` | 3 | a question waits |
| `STOP …` | 1 | the run was stopped (SIGTERM / Ctrl-C) |
| (an error on stderr) | 4 | another process runs this pipeline now |

Quote a path that has spaces.

## The files

```json
{
  "format": 1,
  "title": "AI news, daily",
  "parallel": 4,
  "steps": [
    {"id": "fetch",  "kind": "sh",    "run": "steps/fetch.sh",  "out": ["news.json"], "fresh": true},
    {"id": "script", "kind": "agent", "prompt": "steps/script.md", "needs": ["fetch"], "out": ["script.md"], "model": "opus"},
    {"id": "tts",    "kind": "sh",    "run": "steps/tts.sh",    "needs": ["script"], "out": ["narration.wav"], "retry": 2, "timeout": "15m"},
    {"id": "copy",   "kind": "agent", "prompt": "steps/copy.md",   "needs": ["script"], "out": ["options.md"]},
    {"id": "pick",   "kind": "human", "ask": "Which cover line?",  "needs": ["copy"], "choices": "copy/options.md"},
    {"id": "render", "kind": "sh",    "run": "steps/render.sh", "needs": ["tts", "pick"], "out": ["video.mp4"], "timeout": "40m"}
  ]
}
```

A step: `id` (lowercase letters, digits, `-`, `_`), `title` (what the page shows), `kind`, `needs` (the steps
before it), `out` (the files it writes in its own folder), and as it needs: `retry` (0–10 more tries), `timeout`
(`"90s"`, `"15m"`, `"2h"`), `fresh: true` (it reads the outside world, so it runs every time), `in` (files of the
pipeline's folder it reads besides its script, such as a config: a change to them runs it again), `env`
(`{"NAME": "text"}`), `note` (for people: what the step does, shown on the page; a change to it runs nothing again).

- **`sh`**: `run` is a file in the folder (`steps/x.sh`, `.mjs`, `.py`; words after it are passed on) or a shell
  command. It runs in its own folder of the run, `runs/<time>/<id>/`, with `$OUT` (that folder), `$PIPELINE_DIR`,
  `$RUN_DIR`, `$RUN`, `$STEP`, `$TRY` (1, 2, …) and `$IN_<ID>` for each step it needs (`$IN_SCRIPT`: the folder
  of step `script` in this run). It succeeds when it exits 0 and every file of `out` is there.
- **`agent`**: `prompt` is a Markdown file in the folder. The run hands it to `claude -p` (or the `agent`
  command, below) in the step's folder, with a few lines added: where the inputs are and which files to write.
  `model` picks the model. `"agent": ["codex", "exec", "--full-auto", "-"]` on the pipeline or a step uses
  another command: it gets the prompt on stdin and the model in `$AGENT_MODEL`.
- **`human`**: `ask` is the question; `choices` (`"<step>/<file>"`, a step it needs) offers that file's lines
  as choices. The run stops there with WAIT; the person answers on the page or you run `answer`; the answer is
  the file `answer.txt` (or its one `out`) for the steps after it.

A step whose fingerprint (its definition, its script or prompt, its `in` files, and what the steps it needs
made) matches a done step of an earlier run is taken from it: its files are linked into this run, it shows as
"unchanged", and it does not run. So a fixed script reruns only itself and the steps its new files change.

## Designing a pipeline

1. Ask what you cannot read: what goes in, what must come out and where, how often, what may fail and what then,
   which step a person must decide, how long each step may take. Read the existing scripts when there are some.
2. `new "<title>"` (or work in the folder that has `pipeline.json`), write every step into `pipeline.json` with its
   `needs` and `out`, no scripts yet, and `open` it: the page draws the steps as dashed boxes. Give the user the
   `url` once. Agree on the steps before writing them.
3. Design the steps so they can be run again and moved:
   - one step, one job; a step reads only the folders of the steps it needs and the files in `in`, and writes only
     in `$OUT` (never into the pipeline's folder or a step before it);
   - name every file a later step reads in `out`; pass files, not state;
   - a step that touches the outside world (download, upload, publish, pay) is its own step, `fresh` when it reads
     and never retried blindly when it writes: a repeat must not publish twice;
   - a time limit on every step that could hang, retries only where a second try can help.
4. Write the steps one at a time. After each, `run --only <step>` and look at its files and log (on the page or in
   `runs/<time>/<step>/`). Move on when it is right.
5. `check` until `problems` is 0 and `todo` is empty; then one whole `run`.
6. Working on a card (a task note)? Put the folder's path and the page's `url` in its deliverables.

## Running and fixing

- A FAIL line names the step and its log. Read the log, fix the script or prompt, then `resume`: the steps before
  it stay done. `resume --from <step>` when a done step must run again (its input elsewhere changed).
- A WAIT line: ask the person, or let them answer on the page (it carries the run on by itself). With an answer
  from them in chat, `answer "<folder>" <step> "<text>" --resume`.
- A run whose process died (sleep, reboot, kill) shows as interrupted; `resume` carries it on.
- `runs/` grows by one folder per run. Delete old run folders when they take too much space (not one that runs).

## On a schedule

The run is one command: `node <skill>/scripts/pipeline.mjs run "<folder>"`. `schedule` prints it with the absolute
path of this script. Give it to whatever starts jobs on a schedule:

- Bot Tome: a scheduled note with `command:` set to that line (a script job, not a prompt), and `bot:` set to the
  bot that should read how it ended.
- launchd or cron: the crontab line `schedule` prints (it appends the output to `runs/cron.log`).

Whoever starts it reads the exit code and the last line; nothing in the pipeline knows who started it.

## The page

The steps as a graph, left to right in the order of their needs, each box colored by its state in the latest run
(or a run picked at the top): dashed = not written yet, green = done, grey = unchanged (taken from an earlier
run), blue = running, red = failed, orange = waits for a person. A click on a step shows what it is, its log, and
its files: pictures, sound and video play in the page, text shows, CSV and TSV as a table. A step that waits for
a person shows its question with the choices; the answer carries the run on.

## What is not here

- No scheduler and no daemon: something else starts `run`; when it ends, nothing runs.
- No editing on the page: the user asks, you change `pipeline.json` and the steps.
- Comments on a step, cloud targets (Cloud Workflows, Step Functions) and data warehouse transforms are not part
  of it yet.

## Files this skill touches

It reads the pipeline's folder and writes only in its `runs/` (each run's folder, `.lock` while a run goes on)
and the folders `new` makes. Its own notes are in `~/.tome-pipeline/` (`$TOME_PIPELINE_HOME` moves it): the
opened pipelines and the running page.
