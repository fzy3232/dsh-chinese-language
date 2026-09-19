# dsh-chinese-language

让 DeepSeek Harness（`dsh`）的智能体用简体中文思考和回答——以一条追加在末尾的 system prompt 段落实现，不碰原生 persona 配置。

[English](README.md) | 中文

---

## 为什么需要它

DSH 出厂时的 system prompt 是英文优先的。模型的隐藏推理跟着 system prompt 走，可见回答又跟着推理走，所以只要没有东西明确约束，长会话就会自然滑向英文。

在每条消息里写"用中文回答"当然有效，但那是**单会话**的：换个窗口、恢复一个旧会话就没了。这个插件把规则写在模型每次都会读到的地方——system prompt 装订完成后的最末尾。

## 它做了什么

- 只注册**一个** prompt 段落，名字是 `user:chinese-language`，order 为 `10300`。
- 落在 `deployment:persona-suffix`（order `10200`）之后，也就是装订结果的最后一段。
- 纯追加：不替换 `personaPrefix` / `personaSuffix`，不重写任何工具、技能、workspace 指令行，也不改变任何原生段落的顺序。
- 覆盖所有继承挂载作用域的智能体。挂在根作用域时，每个会话和每个加入该作用域的子智能体都会读到。

默认规则是四行：

```text
语言规则：始终使用简体中文进行内部推理、计划、工具说明和最终回答。
代码、命令、文件路径、URL、API 名称、错误原文和专有名词保留原文。
不要使用英文进行分析、解释或组织答案。
最终语言检查：输出前确认内部推理和可见回答均使用简体中文。
```

## 安装

### 方式一：从 GitHub 安装（推荐）

```sh
dsh plugin --profile web add github:fzy3232/dsh-chinese-language
dsh web   # 重启生效，然后新建一个会话
```

### 方式二：从 npm 安装（发布后可用）

```sh
dsh plugin --profile web add dsh-chinese-language
```

两个渠道的机制相同：包内声明了 `dsh.bundle.patch`，所以 `dsh plugin add` 会把它追加进 `dsh.profile.bundles`，启动时加载器再合并包内的 [`cordis.patch.yml`](cordis.patch.yml) 插入插件行。**不需要手改任何 profile 文件。**

如果你用的不是 Web profile，把 `web` 换成 `tui`、`headless` 等自己的 profile 名。

### 方式三：单文件本地挂载（不用包管理器）

插件就是一个零依赖的 ES module，因此也可以当本地文件用。

```sh
mkdir -p "$DSH_HOME/dsh-plugins"
curl -fsSL -o "$DSH_HOME/dsh-plugins/chinese-language.mjs" \
  https://raw.githubusercontent.com/fzy3232/dsh-chinese-language/main/lib/index.js
```

然后在 `$DSH_HOME/cordis.patch.yml` 里加一条 `insert`（文件不存在就自己建）：

```yaml
- insert:
    - id: user-chinese-language
      name: ./dsh-plugins/chinese-language.mjs
```

## 配置

所有字段都可选。未知键会被忽略；某个已知键的值不可用时，回退到该键的默认值，而不会让整个加载项失败。

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `lines` | 内置的四条规则 | 规则行数组，用换行拼接。空行和非字符串项会被丢掉。 |
| `text` | 无 | 非空时整体取代 `lines`，优先级高于 `lines`。 |
| `order` | `10300` | prompt 段落排序值。大于 `10200` 就会落在所有原生段落之后。 |
| `section` | `user:chinese-language` | 段落名。同一作用域内必须唯一，重名会让加载器直接报错。 |

示例——保留这个段落，只把措辞收紧：

```yaml
- insert:
    - id: dsh-chinese-language
      name: dsh-chinese-language
      config:
        lines:
          - 始终使用简体中文回答。
          - 代码、命令和报错原文保留原文。
```

注意：patch 会**整体替换**目标行的 `config`，所以任何一次覆盖都要把它需要的键全部重写。

## 验证

```sh
dsh --profile web --dump-config | grep -A2 dsh-chinese-language
```

用的是本地挂载方式时，看到的应该是文件路径：

```text
# == /Users/you/.dsh/cordis.patch.yml
- id: user-chinese-language
  name: file:///Users/you/.dsh/dsh-plugins/chinese-language.mjs
```

然后新建一个会话，规则从第一轮就生效，不需要逐条提醒。

## 作用范围与边界

- 它约束的是 **system prompt**，也就是模型开始推理前读到的东西，不是一个 token 级过滤器。
- 隐藏推理是模型的输出。prompt 能强力引导它，但这一层给不出数学意义上的绝对保证——实际表现是"稳定遵守"，而不是"不可能违反"。
- 代码、命令、文件路径、URL、API 名称和报错原文保持原样，这是内置规则的一部分。
- 如果别的插件在同一作用域注册了同名段落，加载器会显式报错。改一下 `section` 即可。

## 卸载

```sh
dsh plugin --profile web remove dsh-chinese-language
```

本地挂载方式：从 `$DSH_HOME/cordis.patch.yml` 删掉那条 `insert`，再删掉 `.mjs` 文件。

## 开发

没有构建步骤，没有运行时依赖。`lib/index.js` 就是整个插件。

```sh
node --check lib/index.js
node -e "import('./lib/index.js').then(m => console.log(m.name, m.inject))"
```

要在真实插件树里验证，用上面的本地挂载配方挂上，再跑一次 `dsh --profile web --dump-config`。

## 许可

MIT，见 [LICENSE](LICENSE)。
