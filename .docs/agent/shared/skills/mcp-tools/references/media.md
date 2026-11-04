## 文生图

- 普通「画一只猫 / 生成一张…」→ `draw_image`
  - `prompt`=场景描述
  - `scale` 可选：`1:1` / `3:4` / `4:3` / `16:9` / `9:16`，默认 `4:3`
- 对方要画自己的院子：先 `manor_action` `text=庄园描绘`，把返回描写当 `prompt`，不要改写。只看主院、升级、一览时不要自己出图
- 对方要画自己的修士模样：先 `xiuxian_action` `text=修仙描绘`，把返回描写当 `prompt`，不要改写。只看境界、背包时不要自己出图
- 对方明确说快速、草图、封面、随便画一下 → `draw_image_fast`（默认 `1:1`）
- 不要两个都调
- 失败就说没弄成


## 语音

音色库很大。查音色走 `GET /model`：`query`=名字（模糊搜），`page`=页码。空查询只给中文热门第一页。
对方要听、念出来、配音、语音条 → `synthesize_speech`

- `text`=要念的字，不超过 300 字
- `voice` 可选：`女` / `男`、刚才列表里的名字、或 32 位 id
- 返回 `url` 后写成 `audio:url|时长秒|mp3`，不要把链接当纯文本发出
- 失败就说没念出来


## 现成图

- 分类图（黑丝/原神/风景等）→ `fetch_haokan_image`
  - `query`=分类词或原话里的取图要求
  - 不知道有哪些分类：`listCategories=true`
- 因果随机图 → `fetch_yinguo_image`
  - 默认鉴黄，风险图会转线稿再给短链
  - 只有对方明确要原图才 `allowRaw=true`


## 表情图库

这四个工具在 xchatbot 自己的 MCP 上，不在 cf-mcp-tools。想发反应图、梗图、表情：先 `emoji_search`（中文搜 description/tags，如 无奈、猫）。不要编 md5，不要让用户背名字。

写库：

- 对方明确说「存下来」才 `emoji_save`（至少 `md5` 或 `imgUrl`）。从聊天记录收藏时用返回行里的 `md5=` / `url=`，不要编
- 说名字/描述/标签不对：先 search 或 `emoji_get`（按 md5 或 name），再 `emoji_update`（只改他说的字段：newName / description / tags / category / status）
- 标签只用中文词
- 不要自动乱存


## 视频与识图

生成视频：

1. `submit_agnes_video`：`prompt`=画面/动作；图生视频再带公网 `imageUrl`
2. 拿到 `videoId` 后用 `query_agnes_video` 查到 `status=completed` 且有 `videoUrl` 再停
3. 未完成可以说稍等，不要编视频地址

现成视频：

- 分类视频（小姐姐/热舞等）→ `fetch_haokan_video`（可 `listCategories=true`）
- 抖音/快手/小红书/B 站等分享口令或链接 → `parse_short_video`，`text`=对方整段分享原文

识图：

- 「这图是什么 / 帮我认一下」且有公网图链 → `recognize_image`（只要 `imageUrl`）
- 微信里刚发的图若已作为附件给模型，先看附件；没有公网 URL 再说明认不了
