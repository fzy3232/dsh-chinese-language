# dsh-chinese-language

让 DeepSeek Harness（`dsh`）的智能体用简体中文思考和回答——通过一条**省 token** 的 system prompt 段落，加一条 runtime context 提醒，不碰原生 persona 配置。

[English](README.md) | 中文

---

## 为什么需要它

DSH 出厂时的 system prompt 是英文优先的。模型的隐藏推理跟着 system prompt 走，可见回答又跟着推理走，所以只要没有东西明确约束，长会话就会自然滑向英文。

在每条消息里写"用中文回答"当然有效，但那是**单会话**的：换个窗口、恢复一个旧会话就没了。这个插件把规则写在模型每次都会读到的地方。

## 它做了什么

插件用**两个通道**注册同一条规则，两者的 token 特性不同：

| 通道 | 落点 | 成本 |
| --- | --- | --- |
| system prompt 段落 `user:chinese-language`，order `10300` | `deployment:persona-suffix`（order `10200`）之后，即装订结果的最末尾 | 每个请求都会重发，因此刻意写短 |
| runtime context 提醒 `user:chinese-language`，order `100` | 运行时动态快照，投影在最新消息旁边 | 只持久化一次：harness 仅在文本变化时写新快照，而这段文本是静态的 |

为什么要两个：新会话靠段落就够了；但**长会话或恢复的会话**历史里已经有大量英文推理，只在历史开头出现一条规则会被冲淡——runtime context 提醒紧贴当前对话重申规则，这正是**已经在跑的会话**不用重开也能重新读到规则的原因。

两个注册都是纯追加：不替换 `personaPrefix` / `personaSuffix`，不重写任何工具、技能、workspace 指令行，也不改变任何原生段落的顺序。它覆盖所有继承挂载作用域的智能体：挂在根作用域时，每个会话和每个加入该作用域的子智能体都会读到。

默认段落是两行，提醒是一行更短的：

```text
语言规则：始终使用简体中文进行内部推理（thinking）与最终回答，历史内容为英文时同样适用。
代码、命令、路径、URL、报错原文和专有名词保留原文。
```

```text
语言提醒：本轮内部推理与可见回答使用简体中文。
```

### token 预算

| 版本 | 稳态默认文本量 |
| --- | --- |
| 0.1.0（只有段落，四行） | 约 148 字符 |
| 0.2.0（两行 + 一行提醒） | 约 99 字符 |

两点保证成本是平的：

- 段落文本很短，且位置固定在 prompt 前缀里，不会让 prefix cache 失效。
- runtime context 文本永不变化，harness 只持久化一次并反复复用那条消息：它不会逐步累积，也不会每轮多出一段提醒文本。

想要绝对最省，用 `context: false` 把提醒通道整体关掉；在 `0.1.7` 系列上，旧行为正好等于 `context: false` 加一段四行的 `lines`。

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

## 升级

GitHub 依赖是按已安装的 commit 锁定的，所以正在跑的 profile 会一直用旧构建，直到你显式刷新：

```sh
dsh plugin --profile web update dsh-chinese-language
dsh web   # 重启 profile 才会加载新模块
```

已经在跑的会话会保留它装订时的那份 system prompt；重启后，runtime context 提醒会在它的下一步到达。

## 配置

所有字段都可选。未知键会被忽略；某个已知键的值不可用时，回退到该键的默认值，而不会让整个加载项失败。

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `lines` | 内置的两条规则 | 段落行数组，用换行拼接。空行和非字符串项会被丢掉。 |
| `text` | 无 | 非空时整体取代 `lines`，优先级高于 `lines`。 |
| `order` | 动态推导，回退 `10300` | 段落排序值。大于 `10200` 就会落在所有原生段落之后。 |
| `section` | 开启，名 `user:chinese-language` | 传 `false` 关闭段落通道；传字符串则作为段落名。 |
| `sectionName` | `user:chinese-language` | 段落名。同一作用域内必须唯一，重名会让加载器直接报错。 |
| `contextText` | 内置的一行提醒 | 单独替换提醒文本，不影响段落文本。 |
| `context` | 开启，名 `user:chinese-language` | 传 `false` 关闭提醒通道；传字符串则作为提醒名。 |
| `contextName` | `user:chinese-language` | 提醒名，同一作用域内必须唯一。 |
| `contextOrder` | 动态推导，回退 `100` | 提醒排序值；值越小，在快照里越靠前。 |

在提供 `getSectionOrder()` / `getContextOrder()` 的 harness 上，两个 order 分别由 `DEPLOYMENT_PERSONA_SUFFIX` 和 `SANDBOX_POLICY` 推导，因此即使原生槽位移动也能跟上；老版本 harness 用常量兜底。

示例——保留两个通道，只把措辞收紧：

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

然后新建会话：规则从第一轮就进入模型。已经在跑的会话，看最新一条消息上方的运行时上下文快照里有没有那条提醒——那是第二个通道在不重启的情况下到达。

## 作用范围与边界

- 它约束的是 **prompt**——system prompt 段落加上 runtime context 快照——也就是模型开始推理前读到的东西，不是一个 token 级过滤器。
- 隐藏推理是模型的输出。prompt 能强力引导它，但这一层给不出数学意义上的绝对保证——实际表现是"稳定遵守"，而不是"不可能违反"。
- 代码、命令、文件路径、URL、API 名称和报错原文保持原样，这是内置规则的一部分。
- 如果别的插件在同一作用域注册了同名段落或同名上下文，加载器会显式报错。改 `sectionName` / `contextName` 即可。
- 比 runtime context API 更老的 harness 会只保留段落通道：插件跳过第二个注册，而不是加载失败。

## 卸载

```sh
dsh plugin --profile web remove dsh-chinese-language
```

本地挂载方式：从 `$DSH_HOME/cordis.patch.yml` 删掉那条 `insert`，再删掉 `.mjs` 文件。

## 开发

没有构建步骤，没有运行时依赖。`lib/index.js` 就是整个插件；`test/contract.test.mjs` 用桩上下文覆盖契约。

```sh
npm test
node --check lib/index.js
```

要在真实插件树里验证，用上面的本地挂载配方挂上，再跑一次 `dsh --profile web --dump-config`。

## 许可

MIT，见 [LICENSE](LICENSE)。
