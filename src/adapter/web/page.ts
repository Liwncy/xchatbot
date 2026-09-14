export function renderWebPage(options: {tokenRequired: boolean}): string {
    const tokenHint = options.tokenRequired ? '1' : '0';
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>xchatbot web</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font: 15px/1.45 system-ui, sans-serif; background: #111; color: #eee; }
    main { max-width: 720px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
    h1 { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    input, textarea, button { font: inherit; border-radius: 8px; border: 1px solid #444; background: #1b1b1b; color: inherit; padding: 8px 10px; }
    #log { flex: 1; overflow: auto; border: 1px solid #333; border-radius: 8px; padding: 12px; background: #181818; }
    .row { margin: 0 0 10px; white-space: pre-wrap; }
    .me { color: #9cdcfe; }
    .bot { color: #ce9178; }
    .sys { color: #888; }
    form { display: flex; gap: 8px; margin-top: 12px; }
    form textarea { flex: 1; min-height: 44px; resize: vertical; }
    button { cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: default; }
  </style>
</head>
<body>
  <main>
    <h1>Web 适配器</h1>
    <div class="meta">
      <input id="userId" placeholder="用户 ID（可填 wxid 接已有修仙号）" value="web-user" />
      <input id="userName" placeholder="显示名（可选）" />
    </div>
    ${options.tokenRequired ? '<input id="token" placeholder="WEB_ADAPTER_TOKEN" />' : ''}
    <div id="log"></div>
    <form id="form">
      <textarea id="content" placeholder="修仙状态" required></textarea>
      <button type="submit">发送</button>
    </form>
  </main>
  <script>
    const tokenRequired = ${tokenHint} === 1;
    const log = document.getElementById('log');
    const form = document.getElementById('form');
    const contentEl = document.getElementById('content');
    function add(cls, text) {
      const row = document.createElement('div');
      row.className = 'row ' + cls;
      row.textContent = text;
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const content = contentEl.value.trim();
      if (!content) return;
      const userId = document.getElementById('userId').value.trim() || 'web-user';
      const userName = document.getElementById('userName').value.trim();
      const token = tokenRequired ? (document.getElementById('token').value.trim() || '') : '';
      add('me', '你：' + content);
      contentEl.value = '';
      form.querySelector('button').disabled = true;
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch('/adapter/web/message', {
          method: 'POST',
          headers,
          body: JSON.stringify({ userId, userName, content }),
        });
        const data = await res.json();
        if (!res.ok) {
          add('sys', data.error || ('HTTP ' + res.status));
          return;
        }
        if (data.handled) add('sys', '交给 OpenClaw 了，回复不会出现在这个页面');
        const replies = Array.isArray(data.replies) ? data.replies : [];
        if (replies.length === 0 && !data.handled) add('sys', '没人接');
        for (const reply of replies) {
          const type = reply && reply.type;
          if (type === 'image') add('bot', 'bot：[图片] ' + (reply.url || ''));
          else if (type === 'video') add('bot', 'bot：[视频] ' + (reply.url || ''));
          else if (type === 'voice') add('bot', 'bot：[语音] ' + (reply.url || ''));
          else if (type === 'emoji') add('bot', 'bot：[表情] ' + (reply.md5 || ''));
          else if (type === 'link' || type === 'music') add('bot', 'bot：[' + (type === 'music' ? '音乐' : '链接') + '] ' + (reply.title || reply.url || ''));
          else add('bot', 'bot：' + (reply.content || ''));
        }
      } catch (err) {
        add('sys', String(err));
      } finally {
        form.querySelector('button').disabled = false;
        contentEl.focus();
      }
    });
  </script>
</body>
</html>`;
}
