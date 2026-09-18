import assert from 'node:assert/strict';
import {normalizeEmojiStashCategory} from '../src/core/emoji-stash/categories.ts';
import {
    fallbackEmojiName,
    normalizeChineseTags,
    normalizeTags,
    resolveUniqueEmojiName,
} from '../src/core/emoji-stash/names.ts';
import {describeEmoji, translateTags} from '../src/core/emoji-stash/tag-zh.ts';
import {isDurableImageUrl, isEphemeralImageUrl} from '../src/core/emoji-stash/urls.ts';

assert.equal(normalizeEmojiStashCategory('REACT'), 'react');
assert.equal(normalizeEmojiStashCategory('没有'), 'misc');
assert.deepEqual(normalizeChineseTags(['无奈', 'shrug', '摊手摊手摊手摊手摊手', '无奈']), ['无奈', '摊手摊手摊手摊手摊手']);
assert.deepEqual(normalizeTags(['cow', 'worried', '无奈', 'cow']), ['牛', '担心', '无奈']);
assert.deepEqual(translateTags(['cat', 'facepalm', 'misc']), ['猫', '捂脸', '杂项']);
assert.equal(describeEmoji('worried_cow', ['cow', 'worried'], 'react').includes('牛'), true);
assert.equal(resolveUniqueEmojiName('担心的牛', ['担心的牛'], 'x'), '担心的牛_2');
assert.equal(fallbackEmojiName('37dffdc4c975ef8bee6852e770e2e5d6').startsWith('emoji_'), true);
assert.equal(resolveUniqueEmojiName('shrug_cat', ['shrug_cat'], 'x'), 'shrug_cat_2');
assert.equal(resolveUniqueEmojiName('shrug_cat', ['shrug_cat', 'shrug_cat_2'], 'x'), 'shrug_cat_3');
assert.equal(isEphemeralImageUrl('http://wxapp.tc.qq.com/262/20304/stodownload?m=abc&filekey=xx'), false);
assert.equal(isDurableImageUrl('http://wxapp.tc.qq.com/262/20304/stodownload?m=abc'), true);
assert.equal(isDurableImageUrl('https://file.upfile.live/abc'), true);
assert.equal(isDurableImageUrl('https://mcp.lwcfworker.dpdns.org/i/c81f4663702842c6a69b'), false);
assert.equal(isDurableImageUrl('https://emoji.local/placeholder'), false);

console.log('✓ emoji-stash');
