-- 低価格の「簡易版(lite)」プランを追加。2026-11-20。
-- アカウント権限あり・機能は限定的(限定の中身はあとで決める)。おすすめ枠・広告枠は、無料(free)と簡易版(lite)に出し、通常版(standard など)には出さない。
-- 価格は未設定(0円)・非公開。運営が管理画面の「プラン」で金額を決めて、公開にする。
insert into public.locapass_plans (code, name, monthly_fee, is_public, sort_order, description)
values ('lite', '簡易版', 0, false, 5, '低価格プラン。管理画面は使えるが、機能は一部限定。おすすめ枠・広告枠が表示される。')
on conflict (code) do nothing;
