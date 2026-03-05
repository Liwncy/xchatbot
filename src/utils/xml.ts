/**
 * Minimal XML parser for Cloudflare Workers.
 * Extracts simple tag values from XML strings without external dependencies.
 */

/**
 * Parse a flat XML document into a key-value record.
 * Handles CDATA sections and simple text nodes.
 *
 * @example
 * parseXml('<root><Foo>bar</Foo><Baz><![CDATA[qux]]></Baz></root>')
 * // => { Foo: 'bar', Baz: 'qux' }
 */
export function parseXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Match any <TagName>...</TagName> pair where the content is either a CDATA
  // section or plain text (no nested tags — suitable for flat WeChat/DingTalk XML).
  //
  // Group 1: tag name
  // Group 2: CDATA payload  (present when content is <![CDATA[...]]>)
  // Group 3: plain text payload (present when content is raw text)
  const cdataPattern = /<!\[CDATA\[([\s\S]*?)\]\]>/;
  const plainPattern = /([^<]*)/;

  // Combined: <TAG>( CDATA | plain )</TAG>
  const tagRegex = new RegExp(
    `<(\\w+)>(?:${cdataPattern.source}|${plainPattern.source})</\\1>`,
    'g',
  );

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(xml)) !== null) {
    const tagName = match[1];
    // CDATA content is capture group 2; plain text is capture group 3
    const value = match[2] !== undefined ? match[2] : (match[3] ?? '');
    result[tagName] = value;
  }
  return result;
}

/**
 * Wrap a value in a CDATA section.
 */
export function cdata(value: string): string {
  return `<![CDATA[${value}]]>`;
}

/**
 * Build a simple XML string from a tag name and child key-value pairs.
 * String values are automatically wrapped in CDATA sections.
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
