-- 只清会过期的短链 / 占位链。微信表情 stodownload 不要清。
UPDATE emoji_stash
SET img_url = ''
WHERE img_url LIKE '%/i/%'
   OR img_url LIKE '%.local/%';
