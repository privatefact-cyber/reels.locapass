-- 店舗ジャンルを自由入力から固定カテゴリへ変更する。
-- 「風俗系」を連想させる表現(エステサロン等)を避け、水商売・ナイトワーク業態として
-- 明確な5カテゴリのみに限定する(コンプライアンス上の理由、ユーザー合意済み)。

update public.shops set genre = null where genre is not null
  and genre not in ('ガールズバー', 'キャバクラ', 'コンカフェ', 'ラウンジ/クラブ', 'スナック/バー');

alter table public.shops
  add constraint shops_genre_check
  check (genre is null or genre in ('ガールズバー', 'キャバクラ', 'コンカフェ', 'ラウンジ/クラブ', 'スナック/バー'));
