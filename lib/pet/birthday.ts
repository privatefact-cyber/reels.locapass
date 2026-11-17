import type { SupabaseClient } from "@supabase/supabase-js";
import { birthdayMessage, daysToBirthday, todayJst, turningAge } from "./calc";
import { notifyPetUser } from "./notify";

type PetRow = { id: string; owner_id: string; name: string; sex: string; birthday: string; birthday_estimated: boolean | null };

const STAGES: Record<number, { stage: "7d" | "1d" | "0d"; daysLeft: 7 | 1 | 0 }> = {
  7: { stage: "7d", daysLeft: 7 },
  1: { stage: "1d", daysLeft: 1 },
  0: { stage: "0d", daysLeft: 0 },
};

/**
 * 誕生日のお知らせ。毎朝(日本時間9時)、1週間前・前日・当日の子の飼い主に、犬が話しかけるような文で知らせる。
 * 同じ子・同じ年・同じ段階では1回だけ(locapass_pet_birthday_log)。アプリ内のお知らせ+(設定済みなら)プッシュ・LINE。
 */
export async function runBirthdayReminders(admin: SupabaseClient, today = todayJst()): Promise<{ checked: number; sent: number }> {
  let checked = 0;
  let sent = 0;
  const PAGE = 1000;
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await admin
      .from("locapass_pets")
      .select("id, owner_id, name, sex, birthday, birthday_estimated")
      .not("birthday", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[pet-birthday] query failed", error.message);
      break;
    }
    const pets = (data ?? []) as PetRow[];
    for (const pet of pets) {
      checked++;
      const left = daysToBirthday(pet.birthday, today);
      const st = left === null ? undefined : STAGES[left];
      if (!st) continue;

      // 先に記録を入れ、入った(=まだ送っていない)ときだけ送る
      const { data: logged } = await admin
        .from("locapass_pet_birthday_log")
        .upsert({ pet_id: pet.id, year: Number(today.slice(0, 4)), stage: st.stage }, { onConflict: "pet_id,year,stage", ignoreDuplicates: true })
        .select("id");
      if (!logged?.length) continue;

      const msg = birthdayMessage({
        name: pet.name,
        sex: pet.sex,
        daysLeft: st.daysLeft,
        turning: turningAge(pet.birthday, today),
        estimated: Boolean(pet.birthday_estimated),
      });
      await notifyPetUser({ userId: pet.owner_id, type: "pet_reminder", title: msg.title, body: msg.body, url: `/pet/${pet.id}` }).catch((e) =>
        console.error("[pet-birthday] notify failed", e),
      );
      sent++;
    }
    if (pets.length < PAGE) break;
  }
  return { checked, sent };
}
