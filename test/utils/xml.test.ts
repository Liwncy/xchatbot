import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseXml, buildXml, cdata } from '../../src/utils/xml.js';

describe('parseXml', () => {
  it('parses simple tag values', () => {
    const xml = '<root><Foo>bar</Foo><Baz>qux</Baz></root>';
    expect(parseXml(xml)).toEqual({ Foo: 'bar', Baz: 'qux' });
  });

  it('parses CDATA sections', () => {
    const xml = '<root><Foo><![CDATA[hello world]]></Foo></root>';
    expect(parseXml(xml)).toEqual({ Foo: 'hello world' });
  });

  it('handles mixed CDATA and plain text', () => {
    const xml =
      '<xml>' +
      '<ToUserName><![CDATA[gh_123]]></ToUserName>' +
      '<FromUserName><![CDATA[user_456]]></FromUserName>' +
      '<MsgType><![CDATA[text]]></MsgType>' +
      '<Content><![CDATA[Hello]]></Content>' +
      '<CreateTime>1700000000</CreateTime>' +
      '</xml>';
    const result = parseXml(xml);
    expect(result.ToUserName).toBe('gh_123');
    expect(result.FromUserName).toBe('user_456');
    expect(result.MsgType).toBe('text');
    expect(result.Content).toBe('Hello');
    expect(result.CreateTime).toBe('1700000000');
  });

  it('returns empty record for document with no child tags', () => {
    expect(parseXml('')).toEqual({});
    expect(parseXml('no tags here')).toEqual({});
  });

  it('handles CDATA with special characters', () => {
    const xml = '<root><Content><![CDATA[<script>alert(1)</script>]]></Content></root>';
    expect(parseXml(xml)).toEqual({ Content: '<script>alert(1)</script>' });
  });
});

describe('buildXml', () => {
  it('builds XML with string values wrapped in CDATA', () => {
    const result = buildXml('xml', { Foo: 'bar', Baz: 'qux' });
    expect(result).toBe('<xml><Foo><![CDATA[bar]]></Foo><Baz><![CDATA[qux]]></Baz></xml>');
  });

  it('builds XML with numeric values as plain text', () => {
    const result = buildXml('xml', { CreateTime: 1700000000 });
    expect(result).toBe('<xml><CreateTime>1700000000</CreateTime></xml>');
  });
});

describe('cdata', () => {
  it('wraps value in CDATA section', () => {
    expect(cdata('hello')).toBe('<![CDATA[hello]]>');
  });
});
