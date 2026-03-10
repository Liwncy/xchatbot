/**
 * 适用于 Cloudflare Workers 的轻量 XML 解析器。
 * 从 XML 字符串中提取简单标签值，不依赖外部库。
 */

/**
 * 将扁平 XML 文档解析为键值对记录。
 * 支持 CDATA 段和普通文本节点。
 *
 * @example
 * parseXml('<root><Foo>bar</Foo><Baz><![CDATA[qux]]></Baz></root>')
 * // => { Foo: 'bar', Baz: 'qux' }
 */
export function parseXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};

  // 匹配 <TagName>...</TagName> 标签对，内容可以是 CDATA 段或纯文本
  // （不支持嵌套标签 —— 适用于微信/钉钉等扁平 XML）。
  //
  // 捕获组 1：标签名
  // 捕获组 2：CDATA 内容（当内容为 <![CDATA[...]]> 时存在）
  // 捕获组 3：纯文本内容（当内容为原始文本时存在）
  const cdataPattern = /<!\[CDATA\[([\s\S]*?)\]\]>/;
  const plainPattern = /([^<]*)/;

  // 组合：<TAG>( CDATA | 纯文本 )</TAG>
  const tagRegex = new RegExp(
    `<(\\w+)>(?:${cdataPattern.source}|${plainPattern.source})</\\1>`,
    'g',
  );

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(xml)) !== null) {
    const tagName = match[1];
    // CDATA 内容为捕获组 2；纯文本为捕获组 3
    const value = match[2] !== undefined ? match[2] : (match[3] ?? '');
    result[tagName] = value;
  }
  return result;
}

/**
 * 将值包装在 CDATA 段中。
 */
export function cdata(value: string): string {
  return `<![CDATA[${value}]]>`;
}

/**
 * 根据标签名和子键值对构建简单 XML 字符串。
 * 字符串类型的值会自动包装在 CDATA 段中。
 */
export function buildXml(
  rootTag: string,
  fields: Record<string, string | number>,
): string {
  const children = Object.entries(fields)
    .map(([key, value]) => {
      const content = typeof value === 'number' ? String(value) : cdata(String(value));
      return `<${key}>${content}</${key}>`;
    })
    .join('');
  return `<${rootTag}>${children}</${rootTag}>`;
}
