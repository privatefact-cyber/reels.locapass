import Link from "next/link";
import { daysToBirthday, petPronoun, turningAge } from "@/lib/pet/calc";

/**
 * 誕生日カウントダウン。誕生日の10日前になったら、自動で出る(設定も、おすすめも、なし。突然出るのが、うれしい)。
 * 10日前から当日までだけ出て、それ以外の日は出さない。誕生日が入っていない子には、何も出さない。
 * 1週間を切ると、犬のひとことと、お祝いの入り口(日誌・おでかけ)を出す。当日の「枠」は、犬のアイコン側(BirthdayFrame)でつける。
 */
export const COUNTDOWN_DAYS = 10;

export function BirthdayCountdown({ petId, name, sex, birthday, estimated }: { petId: string; name: string; sex: string; birthday: string | null; estimated: boolean }) {
  const left = daysToBirthday(birthday);
  // 誕生日が入っていない子には、何も出さない(登録のおすすめも出さない。10日前になったら、突然出るのが楽しい)
  if (!birthday || left === null) return null;
  // 10日前になるまでは、何も出さない
  if (left > COUNTDOWN_DAYS) return null;

  const turning = turningAge(birthday);
  const md = `${Number(birthday.slice(5, 7))}月${Number(birthday.slice(8, 10))}日`;
  const me = petPronoun(sex);
  const soon = left <= 7;
  const pct = Math.max(4, Math.min(100, Math.round(((COUNTDOWN_DAYS - left) / COUNTDOWN_DAYS) * 100)));

  return (
    <div className={`mt-3 overflow-hidden rounded-[28px] border-2 ${soon ? "border-[#FFC94D] bg-gradient-to-br from-[#FFF3D6] to-[#FFE3D1]" : "border-[#F1E1CF] bg-white"} p-4 shadow-[0_6px_20px_-12px_rgba(122,80,40,0.35)]`}>
      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden>
          {left === 0 ? "🎉" : "🎂"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-[#9C8273]">
            {name}の{turning && turning > 0 ? `${turning}歳の` : ""}誕生日まで{estimated ? "(推定)" : ""}
          </p>
          {left === 0 ? (
            <p className="text-2xl font-extrabold text-[#EE6A36]">きょうが誕生日!</p>
          ) : (
            <p className="text-[#4A3426]">
              <span className="text-xs font-bold">あと</span>
              <span className="mx-1 text-4xl font-extrabold tabular-nums text-[#EE6A36]">{left}</span>
              <span className="text-sm font-extrabold">日</span>
              <span className="ml-2 text-[11px] font-bold text-[#B39C8C]">({md})</span>
            </p>
          )}
        </div>
      </div>

      {/* 10日のうち、どこまで来たか */}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F4E6D6]" role="img" aria-label={`誕生日まで、あと${left}日`}>
        <div className="h-full rounded-full bg-gradient-to-r from-[#FF8E5E] to-[#FFC94D]" style={{ width: `${pct}%` }} />
      </div>

      {soon && (
        <>
          <p className="mt-3 rounded-2xl bg-white/80 px-3 py-2 text-sm font-bold text-[#7A5030]">
            {left === 0 ? `「${me}の誕生日、おぼえててくれてありがとう!」` : left === 1 ? `「${me}の誕生日、あしただよ!」` : `「${me}の誕生日まで、あと${left}日だよ!」`} 🐶
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link href={`/pet/${petId}?tab=diary&compose=1`} className="rounded-full bg-[#FF8E5E] px-3 py-2 text-center text-xs font-extrabold text-white shadow-[0_3px_0_#EE6A36]">
              📸 お祝いを日誌に残す
            </Link>
            <Link href="/pet/spots" className="rounded-full bg-white px-3 py-2 text-center text-xs font-extrabold text-[#EE6A36] shadow-[0_3px_0_#F1E1CF]">
              🗺️ お祝いの場所を探す
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
