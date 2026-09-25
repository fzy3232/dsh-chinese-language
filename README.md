# dsh-chinese-language

Make a DeepSeek Harness (`dsh`) agent think and answer in Simplified Chinese — through a token-lean system-prompt section plus a one-line runtime-context reminder, without touching the deployment persona.

English | [中文](README.zh.md)

---

## Why

DeepSeek Harness ships an English-first system prompt. The model's hidden reasoning follows that prompt, and the visible answer follows the reasoning, so unless something explicitly says otherwise a long session drifts into English.

Telling the agent "answer in Chinese" in every message works, but it is per-session, easy to forget, and gone the moment you resume in a new window. This plugin states the rule where the model always reads it.

## What it does

The plugin registers one rule through **two channels** with different token profiles:

| Channel | Where it lands | Cost |
| --- | --- | --- |
| System-prompt section `user:chinese-language`, order `10300` | after `deployment:persona-suffix` (order `10200`), i.e. the very end of the assembled system prompt | Resent with every request; kept short for that reason |
| Runtime-context reminder `user:chinese-language`, order `100` | the dynamic-context snapshot the harness projects next to the newest messages | Persisted once and retained: the harness writes a new snapshot only when the text changes, and this text is static |

Why both: a fresh session is covered by the section alone. A long or resumed session carries a history full of English reasoning, where a single rule at the head of that history loses influence — the runtime-context reminder restates it next to the live conversation, which is what makes an **already-running session** pick the rule up without being restarted.

Both registrations are purely additive: the plugin never replaces `personaPrefix` / `personaSuffix`, never rewrites a tool, skill, or workspace-instruction row, and never reorders a first-party section. It covers every agent that inherits the mounting scope, so a root mount reaches every session and every subagent that joins it.

The default section is two lines, and the reminder is one shorter line:

```text
语言规则：始终使用简体中文进行内部推理（thinking）与最终回答，历史内容为英文时同样适用。
代码、命令、路径、URL、报错原文和专有名词保留原文。
```

```text
语言提醒：本轮内部推理与可见回答使用简体中文。
```

### Token budget

| Version | Steady-state default text |
| --- | --- |
| 0.1.0 (section only, four lines) | ~148 characters |
| 0.2.0 (two lines + one reminder line) | ~99 characters |

Two properties keep the cost flat:

- The section text is short, and it sits at a stable position inside the prompt prefix, so it does not invalidate the prefix cache.
- The runtime-context text never changes, so the harness persists it once and keeps reusing that message. It does not accumulate per step, and it adds no per-turn reminder text.

Turn the reminder off entirely with `context: false` if you want the absolute minimum; on the `0.1.7` line the old behavior is exactly `context: false` plus a four-line `lines` list.

## Install

### 1. From GitHub (recommended)

```sh
dsh plugin --profile web add github:fzy3232/dsh-chinese-language
dsh web   # restart to apply, then start a new session
```

### 2. From npm, once published

```sh
dsh plugin --profile web add dsh-chinese-language
```

Either channel works the same way: the package declares `dsh.bundle.patch`, so `dsh plugin add` appends `dsh-chinese-language` to `dsh.profile.bundles`, and boot merges the bundled [`cordis.patch.yml`](cordis.patch.yml), which inserts the plugin row. No profile file is edited by hand.

Replace `web` with your profile name (`tui`, `headless`, ...) if you are not on the Web profile.

### 3. Single-file local mount (no package manager)

The plugin is one dependency-free ES module, so it also works as a local file.

```sh
mkdir -p "$DSH_HOME/dsh-plugins"
curl -fsSL -o "$DSH_HOME/dsh-plugins/chinese-language.mjs" \
  https://raw.githubusercontent.com/fzy3232/dsh-chinese-language/main/lib/index.js
```

Then add one `insert` to `$DSH_HOME/cordis.patch.yml` (create the file if it does not exist):

```yaml
- insert:
    - id: user-chinese-language
      name: ./dsh-plugins/chinese-language.mjs
```

## Upgrading

A GitHub dependency is pinned to the installed commit, so a running profile keeps the old build until you refresh it:

```sh
dsh plugin --profile web update dsh-chinese-language
dsh web   # restart the profile to load the new module
```

Already-running sessions keep the system prompt they were assembled with; the runtime-context reminder reaches them on their next step after the restart.

## Configuration

Every field is optional. Unknown keys are ignored, and an unusable value falls back to that key's default instead of failing the loader entry.

| Key | Default | Meaning |
| --- | --- | --- |
| `lines` | the two built-in rules | Section lines, joined with newlines. Empty or non-string entries are dropped. |
| `text` | - | Replaces `lines` entirely when non-empty. Wins over `lines`. |
| `order` | derived, else `10300` | Section sort order. Anything above `10200` lands after the first-party sections. |
| `section` | enabled, named `user:chinese-language` | Either `false` to skip the section channel, or a string naming it. |
| `sectionName` | `user:chinese-language` | Section name. Must stay unique within the scope; a duplicate name throws. |
| `contextText` | the one-line reminder | Replaces the reminder text without touching the section text. |
| `context` | enabled, named `user:chinese-language` | Either `false` to skip the reminder, or a string naming it. |
| `contextName` | `user:chinese-language` | Reminder name, unique within the scope. |
| `contextOrder` | derived, else `100` | Reminder sort order; lower values print earlier in the snapshot. |

On harnesses that expose `getSectionOrder()` / `getContextOrder()`, the two orders are derived from `DEPLOYMENT_PERSONA_SUFFIX` and `SANDBOX_POLICY`, so they still track the registry if those slots move. Older harnesses use the constants.

Example, keeping both channels but tightening the wording:

```yaml
- insert:
    - id: dsh-chinese-language
      name: dsh-chinese-language
      config:
        lines:
          - 始终使用简体中文回答。
          - 代码、命令和报错原文保留原文。
        contextText: 提醒：用简体中文。
```

A patch replaces the targeted row's whole `config`, so restate every key the row needs whenever an override adds one.

## Verify

```sh
dsh --profile web --dump-config | grep -A2 dsh-chinese-language
```

For a local mount, look for your file path instead:

```text
# == /Users/you/.dsh/cordis.patch.yml
- id: user-chinese-language
  name: file:///Users/you/.dsh/dsh-plugins/chinese-language.mjs
```

Then start a new session: the rule reaches the model from the first turn. In a session that is already running, the reminder arrives on its next step — the runtime-context snapshot the harness shows above the newest message carries a contribution named `user:chinese-language`:

```text
Current runtime context. This snapshot supersedes earlier runtime-context snapshots.
...
语言提醒：本轮内部推理与可见回答使用简体中文。
```

That snapshot is written once and then replaced in place, so the reminder neither accumulates nor repeats: only the changing parts of the snapshot (sandbox state, recalled memory, ...) cause a new one.

## When a channel is unavailable

The two channels degrade independently. The rule never disappears because one of them is missing:

| Situation | Section channel | Reminder channel |
| --- | --- | --- |
| Normal | yes | yes |
| Harness without `systemPrompt.context()` (older than the runtime-context API) | yes | skipped |
| Deployment sets `includeRuntimeContext: false` on `dsh-system-prompt` | yes | suppressed by the harness |
| An agent preset claims the prompt with a `complete: true` persona section | **replaced** — the harness restores that section as the sole prompt section | **yes** |

The last row is the reason the reminder exists rather than being a duplicate: a `complete` persona is exactly the case where a section-only language plugin goes silent. Registering one rule through both channels keeps at least one of them in front of the model.

Both channels were exercised against every `@deepseek-ai/dsh-system-prompt` release installed on the development machine — `0.1.5-rc.2`, `0.1.5-rc.3`, `0.1.7-rc.1` and `0.1.7-rc.2` — and mount identically on each, with the section staying last. Releases older than `0.1.5-rc.2` are untested; they keep the section channel and skip the reminder.

## Scope and limits

- This constrains the **prompt** — the system section plus the runtime-context snapshot — which is what the model reads before it starts reasoning. It is not a token-level filter.
- Hidden reasoning is model output. A prompt strongly steers it, but nothing at this layer can give a mathematical guarantee; expect the rule to hold in practice rather than absolutely.
- Code, commands, file paths, URLs, API names, and verbatim error text are meant to stay in their original form. That is part of the shipped rule.
- If another plugin registers a section or a context with the same name in the same scope, the loader fails loudly. Change `sectionName` / `contextName` to resolve it.

## Uninstall

```sh
dsh plugin --profile web remove dsh-chinese-language
```

For a local mount, delete the `insert` entry from `$DSH_HOME/cordis.patch.yml` and remove the `.mjs` file.

## Development

There is no build step and no runtime dependency. `lib/index.js` is the whole plugin.

```sh
npm test          # node --test: contract + manifest (+ real-harness when available)
node --check lib/index.js
```

| Suite | What it covers |
| --- | --- |
| `test/contract.test.mjs` | Both channels, every config key, the older-harness path, the steady-state token budget |
| `test/manifest.test.mjs` | `npm pack --dry-run` carries the module, the patch, the READMEs and the license |
| `test/rc2-integration.test.mjs` | Assembles against the real `@deepseek-ai/dsh-system-prompt`: section last, reminder in the snapshot, `complete` persona, suppressed runtime context, and every release found in the profile's pnpm store |

The third suite imports `@deepseek-ai/*`, which lives in a dsh profile rather than here, so it reports as **skipped** unless those packages resolve. To run it for real, point the checkout at an installed profile (the link is ignored by git):

```sh
ln -sfn "$DSH_HOME/profiles/web/node_modules" node_modules
npm test
```

To exercise it against a real tree, mount it with the local-mount recipe above and re-run `dsh --profile web --dump-config`.

## License

MIT. See [LICENSE](LICENSE).
