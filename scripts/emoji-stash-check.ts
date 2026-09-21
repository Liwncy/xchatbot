import assert from 'node:assert/strict';
import {extractEmojiBracketCommand} from '../src/core/emoji-stash/brackets.ts';
import {normalizeEmojiStashCategory, resolveEmojiStashCategoryToken} from '../src/core/emoji-stash/categories.ts';
import {
    fallbackEmojiName,
    isPlaceholderEmojiName,
    nameFromEmojiLabel,
    normalizeChineseTags,
    normalizeTags,
    resolveUniqueEmojiName,
} from '../src/core/emoji-stash/names.ts';
import {describeEmoji, translateTags} from '../src/core/emoji-stash/tag-zh.ts';
import {readImageMeta} from '../src/core/emoji-stash/image-meta.ts';
import {isDurableImageUrl, isEphemeralImageUrl} from '../src/core/emoji-stash/urls.ts';

assert.equal(normalizeEmojiStashCategory('REACT'), 'react');
assert.deepEqual(normalizeChineseTags(['无奈', 'shrug', '摊手摊手摊手摊手摊手', '无奈']), ['无奈', '摊手摊手摊手摊手摊手']);
assert.deepEqual(normalizeTags(['cow', 'worried', '无奈', 'cow']), ['牛', '担心', '无奈']);
assert.deepEqual(translateTags(['cat', 'facepalm', 'misc']), ['猫', '捂脸', '杂项']);
assert.equal(describeEmoji('worried_cow', ['cow', 'worried'], 'react').includes('牛'), true);
assert.equal(resolveUniqueEmojiName('担心的牛', ['担心的牛'], 'x'), '担心的牛_2');
assert.equal(nameFromEmojiLabel({name: '摊手猫'}, [], 'x'), '摊手猫');
assert.equal(nameFromEmojiLabel({description: '无奈摊手'}, ['无奈摊手'], 'x'), '无奈摊手_2');
assert.equal(nameFromEmojiLabel({tags: ['猫', '无奈']}, [], 'x'), '猫无奈');
assert.equal(nameFromEmojiLabel(null, ['表情'], 'x'), '表情_2');
assert.equal(isPlaceholderEmojiName('e37dffdc4c975ef8bee6852e770e2e5d6'), true);
assert.equal(isPlaceholderEmojiName('emoji_37dffdc4c975'), true);
assert.equal(isPlaceholderEmojiName('摊手猫'), false);
assert.equal(normalizeEmojiStashCategory('没有'), 'misc');
assert.equal(resolveEmojiStashCategoryToken('搞笑'), 'funny');
assert.equal(resolveEmojiStashCategoryToken('funny'), 'funny');
assert.equal(resolveEmojiStashCategoryToken('没有'), null);
assert.deepEqual(extractEmojiBracketCommand('哈哈哈哈[/funny]'), {type: 'category', value: 'funny'});
assert.deepEqual(extractEmojiBracketCommand('来一张[#无奈]'), {type: 'tag', value: '无奈'});
assert.deepEqual(extractEmojiBracketCommand('发[摊手猫]呗'), {type: 'name', value: '摊手猫'});
assert.deepEqual(extractEmojiBracketCommand('[摊手]后面又[/cute]'), {type: 'category', value: 'cute'});
assert.equal(extractEmojiBracketCommand('[狗头]'), null);
assert.equal(extractEmojiBracketCommand('[表情]'), null);
assert.equal(extractEmojiBracketCommand('[Smile]'), null);
assert.equal(extractEmojiBracketCommand('[Doge]'), null);
assert.equal(extractEmojiBracketCommand('[裂开]'), null);
assert.equal(extractEmojiBracketCommand('好的[微笑]'), null);
assert.deepEqual(extractEmojiBracketCommand('好的[微笑][摊手猫]'), {type: 'name', value: '摊手猫'});
assert.deepEqual(extractEmojiBracketCommand('[#无奈]'), {type: 'tag', value: '无奈'});
assert.equal(extractEmojiBracketCommand('没有括号'), null);
assert.equal(fallbackEmojiName('37dffdc4c975ef8bee6852e770e2e5d6').startsWith('emoji_'), true);
assert.equal(resolveUniqueEmojiName('shrug_cat', ['shrug_cat'], 'x'), 'shrug_cat_2');
assert.equal(resolveUniqueEmojiName('shrug_cat', ['shrug_cat', 'shrug_cat_2'], 'x'), 'shrug_cat_3');
assert.equal(isEphemeralImageUrl('http://wxapp.tc.qq.com/262/20304/stodownload?m=abc&filekey=xx'), false);
assert.equal(isDurableImageUrl('http://wxapp.tc.qq.com/262/20304/stodownload?m=abc'), true);
assert.equal(isDurableImageUrl('https://file.upfile.live/abc'), true);
assert.equal(isDurableImageUrl('https://mcp.lwcfworker.dpdns.org/i/c81f4663702842c6a69b'), false);
assert.equal(isDurableImageUrl('https://emoji.local/placeholder'), false);
assert.equal(readImageMeta(Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x02, 0x00, 0x03, 0x00,
]).buffer).width, 2);

console.log('✓ emoji-stash');
