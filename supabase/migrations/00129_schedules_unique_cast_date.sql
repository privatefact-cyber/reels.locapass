-- 同じキャスト・同じ日の出勤予定が二重登録されないようにする。
-- 既存の重複は、開始時刻が遅い方(同じなら id が大きい方)を1件だけ残して整理する。
delete from public.locapass_schedules a
using public.locapass_schedules b
where a.cast_id = b.cast_id and a.date = b.date
  and (coalesce(a.start_time, '00:00'), a.id::text) < (coalesce(b.start_time, '00:00'), b.id::text);

delete from public.schedules a
using public.schedules b
where a.cast_id = b.cast_id and a.date = b.date
  and (coalesce(a.start_time, '00:00'), a.id::text) < (coalesce(b.start_time, '00:00'), b.id::text);

alter table public.locapass_schedules add constraint locapass_schedules_cast_date_key unique (cast_id, date);
alter table public.schedules add constraint schedules_cast_date_key unique (cast_id, date);
