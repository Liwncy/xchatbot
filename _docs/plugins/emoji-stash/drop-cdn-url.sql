-- 不需要单独存微信 CDN。发表情靠 md5，图链只留 img_url。
ALTER TABLE emoji_stash DROP COLUMN cdn_url;
