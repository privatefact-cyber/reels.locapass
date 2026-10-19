-- 曜日ごとの営業時間(複数の時間帯・定休日・LAST)。NULL=未記入(NOWに出さない)。
-- 形式: {"mon":{"closed":false,"ranges":[{"open":"18:00","close":"03:00","last":false}]}, "tue":{...}, ... "sun":{...}}
alter table public.locapass_shops add column if not exists business_hours_weekly jsonb;
