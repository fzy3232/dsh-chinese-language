# dsh-chinese-language

Make a DeepSeek Harness (`dsh`) agent think and answer in Simplified Chinese — as a late, additive system-prompt section, without touching the deployment persona.

English | [中文](README.zh.md)

---

## Why

DeepSeek Harness ships an English-first system prompt. The model's hidden reasoning follows that prompt, and the visible answer follows the reasoning, so unless something explicitly says otherwise a long session drifts into English.

Telling the agent "answer in Chinese" in every message works, but it is per-session, easy to forget, and gone the moment you resume in a new window. This plugin states the rule once, in the place the model always reads: the end of the assembled system prompt.

## What it does

- Registers **one** prompt section named `user:chinese-language` at order `10300`.
- Lands after `deployment:persona-suffix` (order `10200`), i.e. at the very end of the assembled system prompt.
- Is purely additive: it never replaces `personaPrefix` / `personaSuffix`, never rewrites a tool, skill, or workspace-instruction row, and never reorders a first-party section.
- Covers every agent that inherits the mounting scope. Mounted at the root it reaches every session and every subagent that joins it.

The default rule is four lines:

```text
语言规则：始终使用简体中文进行内部推理、计划、工具说明和最终回答。
代码、命令、文件路径、URL、API 名称、错误原文和专有名词保留原文。
不要使用英文进行分析、解释或组织答案。
最终语言检查：输出前确认内部推理和可见回答均使用简体中文。
```

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

## Configuration

Every field is optional. Unknown keys are ignored, and an unusable value falls back to that key's default instead of failing the loader entry.

| Key | Default | Meaning |
| --- | --- | --- |
| `lines` | the four built-in rules | Rule lines, joined with newlines. Empty or non-string entries are dropped. |
| `text` | - | Replaces `lines` entirely when non-empty. Wins over `lines`. |
| `order` | `10300` | Prompt-section sort order. Anything above `10200` lands after the first-party sections. |
| `section` | `user:chinese-language` | Section name. Must stay unique within the scope; a duplicate name throws. |

Example, keeping the section but tightening the wording:

```yaml
- insert:
    - id: dsh-chinese-language
      name: dsh-chinese-language
      config:
        lines:
          - 始终使用简体中文回答。
          - 代码、命令和报错原文保留原文。
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

Then start a new session: the rule reaches the model from the first turn, with no per-message reminder.

## Scope and limits

- This constrains the **system prompt**, which is what the model reads before it starts reasoning. It is not a token-level filter.
- Hidden reasoning is model output. A prompt strongly steers it, but nothing at this layer can give a mathematical guarantee; expect the rule to hold in practice rather than absolutely.
- Code, commands, file paths, URLs, API names, and verbatim error text are meant to stay in their original form. That is part of the shipped rule.
- If another plugin registers a section with the same name in the same scope, the loader fails loudly. Change `section` to resolve it.

## Uninstall

```sh
dsh plugin --profile web remove dsh-chinese-language
```

For a local mount, delete the `insert` entry from `$DSH_HOME/cordis.patch.yml` and remove the `.mjs` file.

## Development

There is no build step and no runtime dependency. `lib/index.js` is the whole plugin.

```sh
node --check lib/index.js
node -e "import('./lib/index.js').then(m => console.log(m.name, m.inject))"
```

To exercise it against a real tree, mount it with the local-mount recipe above and re-run `dsh --profile web --dump-config`.

## License

MIT. See [LICENSE](LICENSE).
