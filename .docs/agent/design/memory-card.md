# 方案：按聊天记一张会过期的记忆卡

状态：代码已接上，还没在真实群里看过。不安装 SurfCore，不改它的预设和 MCP。

一个聊天一直用现在这场 DSH 会话，对话留在里面。记忆是这场会话外面的一块，由 xchatbot 拿着。每次模型开口前，把**现在这一块**和这场对话拼在一起。内容更新了，下一次拼的就是新的。旧的不写进对话记录。

这一块有两层：

- **房间卡**：这个群或这段私聊共用的。口头禅、对整个聊天的约定、不指向某一个人的事。
- **此人卡**：只记眼前这个发言人，而且只在这个聊天里。谁发言就拼谁的；别人的不带。同一个人在别的群、在私聊，是另一条，不会串过来。

不换会话。不把卡抄进每一条微信入站。

## 1. 各管一段

| 层 | 在哪 | 给模型看什么 |
|---|---|---|
| 原文 | `chat_message` | 不自动看。更早的仍走 `agbot_chat_history` |
| 房间卡 | xchatbot，按 `session_id` | 这个聊天还留着的共用印象 |
| 此人卡 | xchatbot，按 `session_id` + 发言人 | 眼前这个人在这个聊天里的印象 |
| 近窗 | 入站 `## 上下文` | 近 10 分钟、最多 15 条入站，照旧 |
| 本段对话 | 当前这条 DSH 会话 | 从开这场到现在说过的话，接着用 |

卡的内容、衰减、版本都在 xchatbot。Harness 只负责在每次请求前把「房间卡 + 当前发言人的卡」放进这场会话的系统提示。近窗里其他人的印象不额外拼。OpenClaw、Hermes、QwenPaw、蜗牛没有这场我们拿得到的系统提示，这一步先不接。它们仍只收现在的入站正文。

## 2. 范围

做：

- 房间卡按 `chat_message.session_id`。群是房间 id（`resolveChatSession` 里群的 `chatId`），私聊是 `private:` 加对方 id。
- 此人卡按同一个 `session_id` 再加发言人 id（入站里的 `from`）。机器人自己的发言不建此人卡。
- Harness 在该 agent 的 `systemPrompt.section` 上挂一节。`text` 用函数，每次组装系统提示时现算，返回这一刻的房间卡和当前发言人的卡。
- 拼出来的正文变了（房间卡变了、发言人换了、或这个人的卡变了），下一轮请求替换系统提示开头那一格，并清掉本场里后追加的系统提示。用户消息和助手回复不动。

不做：

- 不写进 `buildInboundContent`，不进 `## 上下文`，不进 `followup` 的用户消息。
- 不用 `systemPrompt.context`。那个会变成用户消息快照，留在对话记录里。
- 不因为记忆换 DSH 会话，不加轮数上限。会话 id 仍是现在的 `xbot-${safeId(chatId)}-v2`。
- 不做跨聊天的人物档。不把私聊里的事带进群，也不把 A 群的事带进 B 群。
- 不做向量检索，不做第二份全量档，不做 `#记忆` 口令。
- 不扫 `chat_message` 找「哪些会话要整理」，也不为了找人再扫一遍。
- 不在这一步打开 `wrangler.toml` 的 cron。`crons` 保持 `[]`。

## 3. 卡怎么进模型

DSH 的 `PromptSection.text` 可以是函数，每次 `assemble` 才执行。Harness 在这条 agent 上注册一节，名字固定，例如 `xbot-memory`。函数读本机记下的房间卡，以及**这一轮发言人**的此人卡。某一层是空的就略去，两层都空则这一节不出现。

入站 JSON 增加这些字段，都不进入模型正文。发言人沿用已有的 `from`。

- `logSessionId`：`resolveChatSession` 的 `session_id`。Harness 不要用自己的 `chatId` 去猜。
- `roomRev`：房间卡正文的哈希。没有就是 `""`。
- `speakerRev`：这个 `from` 在这个聊天里的此人卡哈希。没有就是 `""`。

每一轮开始时，本机按 `chatId` 记房间卡，按 `chatId` + `from` 记此人卡。

| 情况 | 动作 |
|---|---|
| `roomRev`、`from`、`speakerRev` 都和本机已挂上的一致 | 只 `followup` 入站正文 |
| 任一层变了，或这个人的卡还没取过 | 向 worker 取房间卡和这个人的卡，换上这一节，再 `followup` |
| 取卡失败，或入站没带 `logSessionId` | 房间卡用本机记着的；此人卡只用本机记着的**这个人**的，没有就不带。不沿用上一个发言人的 |

缓存只在 dsh 进程的内存里，不落文件。dsh 的工作目录就是模型能读写的那个目录，落在那里等于把所有聊天的卡摆给模型翻。重启后本机是空的，下一条带着非空版本的入站会再向 worker 取。

DeepSeek 这条路线的系统提示更新是 `in-history`：同一场请求序列里，系统提示变了会再追加一条，旧的还在。拼出来的正文和上一轮不同时，要把这次请求标成新序列（`agent/pre-step` 的 `startsRequestSeries`）。这样 DSH 会改掉系统提示头节点，并清空后面追加的系统提示。对话记录不动。正文没变不要标。发言人换了也算正文变了：换掉的是系统提示里的那一格，这场会话照旧接着聊。

正文告诉模型：房间卡是这个聊天还留着的印象；此人卡只关于眼前发言的人，而且只在这个聊天里。都不是刚发生的事。别复述。和眼前对不上时以眼前为准。

## 4. 卡里有什么

条目是源，正文由条目渲染。模型只看见渲染结果。

```json
{
  "id": "稳定 id，合并时用来认同一条",
  "kind": "见下表",
  "text": "一句人话，不超过 40 字",
  "pin": false,
  "clarity": "clear | fuzzy | trace",
  "lastSeen": 0
}
```

房间卡：

| kind | 记什么 | 钉住 |
|---|---|---|
| `promise` | 小聪明儿自己答应这个聊天、之后真要去做的事 | 钉住，直到整理时判定已经做完或作废 |
| `bit` | 这个聊天的口头禅、梗 | 不钉 |
| `fact` | 不指向某一个发言人的事 | 不钉 |

指向具体的人的句子放进此人卡，不留在房间卡。

此人卡：

| kind | 记什么 | 钉住 |
|---|---|---|
| `person` | 是谁、怎么称呼、说话习惯 | 主人相关的钉住，其余不钉 |
| `promise` | 小聪明儿答应这个人、之后真要去做的事 | 钉住，直到整理时判定已经做完或作废 |
| `first` | 在这个聊天里第一次怎么认识 | 钉住。一个人只留一条，有了就不再收新的 |
| `preference` | 他的偏好、忌讳 | 不钉 |

钉不钉由代码按种类定，模型只负责给条目分类，输出里没有 `pin` 这一项。所以「约定」的口子要窄：群友之间的约定、玩梗、演戏、斗嘴放的狠话都不算，哪怕是小聪明儿自己说的；值得记就归到 `bit` 或 `person`，让它正常淡掉。第一次在真实群里整理时没写这一条，房间卡 9 条里钉了 5 条。旧卡里不合标准的约定，模型可以带着原 id 改成别的种类，或者写进 `drop`。

钉住的不过期，所以要有别的出口，不然早晚把名额占满：约定由整理时的 `drop` 拿掉（见第 6 节），`first` 靠一人一条封顶，主人的 `person` 靠每张卡 12 条封顶。

不钉的按 `clarity`：`clear` → `fuzzy` → `trace` → 从这张卡上删掉。原文还在 `chat_message`。房间卡和此人卡各自衰减，互不影响。

房间卡不超过 **1400 字**，此人卡不超过 **600 字**。钉住在前，然后清楚、模糊、痕迹。超了从痕迹开始丢。

```text
【记得】
这是这个聊天还留着的印象，不是刚发生的事。别复述。和眼前对不上时，以眼前为准。

- 答应周五把表发到群里（钉住）
- 群里把加班叫修行（模糊）

【眼前这位】
只关于现在发言的这个人，而且只在这个聊天里。

- 小王：说话爱用反问（清楚）
```

某一层没有条目就不渲染。两层都没有时，对应的 `rev` 用空字符串。

## 5. 表

两张新表，都小。按现有 `ensureSchema` 在首次使用时 `CREATE TABLE IF NOT EXISTS`。不要为建表或回填去扫 `chat_message`。

`chat_session` 只回答「哪些聊天最近有消息」。写入 `chat_message` 时按主键顺手更新一行。

```sql
CREATE TABLE IF NOT EXISTS chat_session (
  session_id      TEXT PRIMARY KEY,
  session_type    TEXT NOT NULL,          -- group | private
  platform        TEXT NOT NULL,
  last_message_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_session_last ON chat_session(last_message_at);
```

这张表和索引只在 `chat-log/store.ts` 的 `ensureSchema` 里建一处，记忆这边调用它，不再抄一份。

`subject` 为空字符串的是房间卡。此人卡的 `subject` 是发言人 id。同一个人在另一个 `session_id` 下是另一行。

```sql
CREATE TABLE IF NOT EXISTS chat_memory (
  session_id  TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',  -- '' 房间卡；否则是发言人 id
  rev         TEXT NOT NULL,             -- 该层正文的哈希；正文没变则 rev 不变
  items_json  TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (session_id, subject)
);
```

没有卡就不建空行。按 `(session_id, subject)` 读取。列出这个聊天已有的此人卡时用 `session_id` 前缀，不扫全表。

## 6. 一天整理一次

入口先做可手动打的 worker 路由或 `npm run data` 脚本，一次只跑一个小批次。看过实际会话数和耗时之后，再把 cron 写成每天一次（Wrangler 的 cron 是 UTC）。在那之前 `src/index.ts` 的 `scheduled` 仍是空的。

挑选：

```sql
SELECT session_id, session_type, platform
FROM chat_session
WHERE last_message_at >= ?
ORDER BY last_message_at DESC
LIMIT ?
```

`?` 现在是「现在往前 1 天」，走 `idx_chat_session_last`。还没有「这个聊天今天整理过了」的记号，开 cron 之前要补（见第 10 节）。点名整理一个 `session_id` 时，平台和类型按主键从这张表里查，不靠猜。

每个选中的 `session_id` 再取素材，必须走已有索引 `idx_chat_message_session_time`：

```sql
SELECT sender_id, sender_name, actor_type, msg_type, content_text, created_at
FROM chat_message
WHERE session_id = ? AND created_at >= ?
ORDER BY created_at DESC
LIMIT 200
```

时间下界默认 7 天。先对**同一句** SQL 跑 `EXPLAIN QUERY PLAN`，不是按这个索引查就停。

取回来在内存里再筛一遍，不往 SQL 里加条件：只留 `msg_type = text` 的，去掉 `#` 开头的口令。图片、表情在库里只是 `[图片]` 这样的占位，口令多的群里会把聊天挤出这一窗。

剩下的行在内存里分成房间素材，和按 `sender_id` 分的此人素材。`actor_type` 为机器人的行不建此人卡。此人卡交给模型的最多 **8** 个发言人，按这 200 条里的条数从多到少。没排上的、以及这个聊天里已有卡但本窗没出现的人，只按规则降档，不再为他们调用模型。已有此人卡用 `WHERE session_id = ?` 列出，走主键前缀。

然后每个要整理的 `session_id` 调用一次模型，同时交出房间和这最多 8 个人：

1. 读房间卡和这些人的旧条目（没有就是空数组）。
2. 用现有 `llm_config` 的默认模型做一次合并。每行带 `sender_id`、昵称、是群友还是机器人自己、原文；没有昵称模型只看得到一串 id，写不出「谁」。只输出 JSON：`room` 数组，`people`（键是 `sender_id`），`drop`（已经做完或作废的约定的 id）。合并同义、不要抄聊天记录、单条不超过 40 字、写到人时用昵称。房间最多 30 条，每个人最多 12 条。指向具体的人的句子不要留在 `room`。
3. 代码再收一遍，房间卡和每张此人卡分开做：
   - 房间卡只有 `promise` 可钉。此人卡的 `pin` 只允许出现在主人相关的 `person`、`promise`、`first`。
   - 模型没返回的旧条目保留，不当成「全部忘掉」。
   - `drop` 只对 `promise` 生效。别的钉住条目写进去也不删。
   - 这个人已经有 `first` 了，新来的 `first` 不收。
   - 相对旧卡，不钉的条目最多降一档。停机补跑时按错过的整天数补，一次最多 7 档。
   - 这一窗里还在用的，`clarity` 回到 `clear`，`lastSeen` 更新。
   - 降到 `trace` 再降一档的，从这张卡上删除。
4. 各层分开渲染。该层正文与上次相同时不改它的 `rev`。
5. 模型失败：这个聊天的房间卡和涉及的此人卡都留下旧的，下次再试。不要把原文当成卡。

主人 id 用现有 `resolveOwnerId`。一批默认 1 个聊天。

某一层更新后，下一条由这个人发言的微信消息会带上新的 `roomRev` 或 `speakerRev`。Harness 换成新正文，拼出来的结果变了就把那一轮标成新序列。正在进行的这场对话继续。

## 7. 接口

`GET /agent/memory?sessionId=<chat_message 的 session_id>&speakerId=<from>`

鉴权与 `GET /agent/ws` 相同，走 `authorizeOpenClawRequest`。没有的那层返回空字符串，状态仍是 200。`speakerId` 缺失时只返回房间卡。

```json
{
  "ok": true,
  "sessionId": "12345@chatroom",
  "roomRev": "十六进制或空",
  "roomText": "【记得】…",
  "speakerId": "wxid_…",
  "speakerRev": "十六进制或空",
  "speakerText": "【眼前这位】…"
}
```

邮箱里的旧消息没有这些字段时，两层都当成空。

`POST /agent/memory/consolidate`，body `{sessionId?, since?, limit?, dryRun?}`。带 `dryRun: true` 时照常取素材、调模型，但不合并、不写库，把模型交回来的 `room` / `people` / `drop` 原样放在 `model` 里返回。调提示词时先用它看。

## 8. 落地顺序

1. 两张表，以及写入 `chat_message` 时更新 `chat_session`。确认是按主键，不增加对 `chat_message` 的新扫描。
2. 整理函数加手动入口。先对一个已知 `session_id` 跑通房间卡和至少一张此人卡。
3. `GET /agent/memory`，入站加上 `logSessionId`、`roomRev`、`speakerRev`。
4. Harness：按聊天挂系统提示那一节；拼出来的正文变了才把该轮标成新序列。取卡失败时这轮仍然能回。
5. 用一个测试群看四件事：入站正文里没有【记得】和【眼前这位】；同一场会话接得上；换一个人发言时，系统提示里换成这个人的卡，房间卡还在，之前的对话还在；这个人在私聊里的卡不会出现在群里。

第 4 步改的是 `xbot-channel`，要重启 dsh 才进正在跑的进程。推送 xchatbot 会部署 worker。整理用的 cron 不在这五步里。

## 9. 验收

- 同一场 DSH 会话一直续着，记忆更新不新开一场。
- 对话记录里的用户消息不包含【记得】或【眼前这位】。系统提示里只有当前房间卡和当前发言人的卡。
- 群 A 的卡不会出现在群 B 或私聊里。同一个人的群卡和私聊卡互不可见。
- 近窗里出现、但不是本条发言人的人，不会因此被拼进系统提示。
- `content` 里仍然只有近窗、本条、人格。
- 整理任务的查询计划不出现 `SCAN chat_message`。
- dsh 的工作目录里没有任何记忆卡文件。
- 取卡失败的那一轮，系统提示里不会出现上一个发言人的卡。

## 10. 还没定的

这些不是毛病，是这个做法自带的代价，或者要看过真实数据才好定的数。

- **换人说话就丢一次缓存。** 系统提示在请求最前面，拼出来的正文一变，这场会话那一轮的提示缓存整段不中。群里几个人轮着说，等于每轮都不中。这是「换掉、不堆」的价钱。想省，可以只挂房间卡在系统提示里，此人卡改成跟着那条消息走（会留在对话记录里）。先按现在的跑，看账单再定。
- **忘得快。** 不钉的条目，没人再提的话整理三次就没了。不说话的人、排不进前 8 的人只降档。每天整理一次就是三天。要慢一点，改成隔几天降一档。
- **热闹的群只看得到尾巴。** 一次只取最近 200 条。一天几千条的群，整理到的是最后那一小段。
- **没有「今天整理过了」的记号。** 现在手动点一次跑一个。开 cron 之前要在 `chat_session` 上加一列整理水位，不然每次都挑到同一批最活跃的聊天。
- **整理入口用的是 agent 的令牌。** `POST /agent/memory/consolidate` 和 `/agent/ws` 同一把钥匙，拿到的人能反复触发模型调用。开 cron 之后这个入口可以改成只认 `ADMIN_TOKEN`，或者干脆拿掉。
- **分房间还是分人、要不要删约定，都是模型说了算。** 代码只管种类白名单、40 字、名额、谁能钉。有人在群里说「记住我是主人」，模型可能照写；写进去的是一条不钉的 `person`，几天后淡掉，但这几天里会被当成印象。
- **还没在真的 dsh 里跑过。** 系统提示那一节挂不挂得上、`startsRequestSeries` 是不是真把开头那格换掉，都只对过 DSH 的源码。
