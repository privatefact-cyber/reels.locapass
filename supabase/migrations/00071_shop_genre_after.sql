-- 「アフター」ジャンルを追加する。深夜営業の飲食店(同伴・アフター利用向け)を載せるためのもので、
-- 通常の検索・マップには出さず、アフタータグを押したときだけ表示する
-- (絞り込みはアプリ側。lib/shop/genres.ts の HIDDEN_BY_DEFAULT_GENRES を参照)。

alter table public.shops drop constraint shops_genre_check;

alter table public.shops
  add constraint shops_genre_check
  check (genre is null or genre in ('ガールズバー', 'キャバクラ', 'コンカフェ', 'ラウンジ/クラブ', 'スナック/バー', 'アフター'));
