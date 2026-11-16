import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { petAdmin, requirePetViewer } from "@/lib/pet/db";
import { listAccountRoles } from "@/lib/pet/account";
import { PetDeleteAccount } from "@/components/pet/PetDeleteAccount";
import { lineConfigured } from "@/lib/pet/notify";
import { PetSettingsForm } from "@/components/pet/PetSettingsForm";
import { PetPushCard } from "@/components/pet/PetPushCard";
import { PetSignOutButton } from "@/components/pet/PetSignOutButton";
import { PetAiConsentSetting } from "@/components/pet/AiConsent";
import { PetBlockedList } from "@/components/pet/PetBlockedList";
import { getBlockedIds } from "@/lib/pet/blocks";
import { PetCard } from "@/components/pet/ui";

export const dynamic = "force-dynamic";

const LINE_MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: { tone: "ok", text: "LINEとつながりました!確認のメッセージをLINEに送りました。" },
  friend: { tone: "warn", text: "LINEとつなぎましたが、メッセージを送れませんでした。LOCAPASSの公式アカウントを友だち追加(ブロック解除)してください。" },
  pending: { tone: "warn", text: "LINEとつなぎました。友だち追加の反映に少し時間がかかることがあります。" },
  login: { tone: "warn", text: "ログインが切れていました。もう一度ログインしてからお試しください。" },
  error: { tone: "warn", text: "LINEとの連携に失敗しました。少し時間をおいてお試しください。" },
};

export default async function PetSettingsPage({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const { line } = await searchParams;
  const { supabase, userId } = await requirePetViewer("/pet/settings");
  const [{ data: s }, { data: areas }] = await Promise.all([
    supabase.from("locapass_pet_owner_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("locapass_pet_walk_areas").select("id, lat, lng, label").order("created_at"),
  ]);
  const notice = line ? LINE_MESSAGES[line] : null;
  // ブロックしている人(ニックネームと、その人の犬の名前で見分けられるようにする)
  const blockedIds = [...(await getBlockedIds(userId))];
  const blockedUsers: { userId: string; label: string }[] = [];
  if (blockedIds.length) {
    const admin = petAdmin();
    const [{ data: members }, { data: pets }] = await Promise.all([
      admin.from("locapass_members").select("id, nickname").in("id", blockedIds),
      admin.from("locapass_pets").select("owner_id, name").in("owner_id", blockedIds).order("sort_order"),
    ]);
    for (const id of blockedIds) {
      const nick = (members ?? []).find((m) => m.id === id)?.nickname as string | undefined;
      const names = (pets ?? []).filter((p) => p.owner_id === id).map((p) => p.name as string).slice(0, 2);
      blockedUsers.push({ userId: id, label: names.length ? `${names.join("・")}の飼い主(${nick ?? "ゲスト"})` : (nick ?? "ゲスト") });
    }
  }
  // 他サービスの役割(店舗管理者・キャストなど)がある人は、アカウント削除でロカわんのデータだけを消す
  // 調べられないとき(null)は、安全な側(データだけ削除の説明)に倒す
  const roles = (await listAccountRoles(petAdmin(), userId)) ?? ["unknown"];

  return (
    <div>
      <div className="mb-3 mt-2 px-1">
        <h1 className="text-2xl font-extrabold">設定</h1>
      </div>
      {notice && (
        <PetCard className={`mb-4 text-sm font-bold ${notice.tone === "ok" ? "bg-[#E5F8EC] text-[#06A34A]" : "bg-[#FFF8E1] text-[#8A6A00]"}`}>{notice.text}</PetCard>
      )}
      <div className="mb-4">
        <PetPushCard />
      </div>
      <PetAiConsentSetting />
      <PetBlockedList users={blockedUsers} />
      <Link href="/pet/follows" className="mb-4 block">
        <PetCard className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            💗
          </span>
          <span className="flex-1 text-sm">
            <b className="block">フォロー</b>
            <span className="text-xs text-[#9C8273]">フォロー中の子・フォローのお願いの承認</span>
          </span>
          <ChevronRight className="text-[#D9C4B4]" size={20} />
        </PetCard>
      </Link>
      <PetSettingsForm
        walkAreas={(areas ?? []) as { id: string; lat: number; lng: number; label: string | null }[]}
        lostAlertOptIn={s?.lost_alert_opt_in ?? true}
        hereAlertOptIn={s?.here_alert_opt_in ?? false}
        lineLinked={Boolean(s?.line_user_id)}
        lineNotify={s?.line_notify ?? true}
        lineReady={lineConfigured()}
      />
      <PetSignOutButton />
      <PetDeleteAccount hasRoles={(roles?.length ?? 0) > 0} />
      <p className="mt-6 px-2 text-center text-[11px] leading-relaxed text-[#B39C8C]">
        ロカわんはLOCAPASSのアカウントで動いています。
        <br />
        手帳・通院の記録はあなただけが見られます。
      </p>
    </div>
  );
}
