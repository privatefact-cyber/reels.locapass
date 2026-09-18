-- リールポータルのストレージ/転送量コスト対策(1/2)。
-- 圧縮なしの巨大ファイルがそのままアップロードされて保存量・配信量が
-- 際限なく膨らむのを防ぐため、reelsバケットにサイズ上限とMIME制限をかける。
-- クライアント側(CastMypageClient.tsx)にも同等のチェックを入れているが、
-- こちらはバイパスされても効くサーバー側の最終防衛ライン。

update storage.buckets
set
  file_size_limit = 20971520, -- 20MB
  allowed_mime_types = array[
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
where id = 'reels';
