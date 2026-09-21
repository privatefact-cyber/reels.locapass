-- 35MB以下の編集済み動画はブラウザから直接アップロードする。
-- 35MB超だけクライアント側FFmpegで約15MBへ圧縮するため、Storageの最終制限も
-- UIのバイパス閾値と一致させる。
update storage.buckets
set file_size_limit = 36700160 -- 35 * 1024 * 1024
where id = 'locapass-reels';
