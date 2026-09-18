-- 微信表情 CDN 现在还能打开，从 legacy 写回 img_url。占位链不要。
UPDATE emoji_stash
SET img_url = (
  SELECT cdnurl FROM emoji_stash_legacy
  WHERE emoji_stash_legacy.id = emoji_stash.id
)
WHERE IFNULL(img_url, '') = ''
  AND EXISTS (
    SELECT 1 FROM emoji_stash_legacy
    WHERE emoji_stash_legacy.id = emoji_stash.id
      AND IFNULL(cdnurl, '') <> ''
      AND cdnurl NOT LIKE '%.local/%'
  );
