-- LUXELA cast_members.cast_code と同じく、列の既定値で自動採番する(トリガーでも補完済みだが、
-- INSERT時にcast_codeを省略できるようにするため)。
alter table public.locapass_cast_members alter column cast_code set default public.locapass_generate_cast_code();
