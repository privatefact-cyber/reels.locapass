import { requirePetViewer } from "@/lib/pet/db";
import { lineConfigured } from "@/lib/pet/notify";
import { PetSettingsForm } from "@/components/pet/PetSettingsForm";
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

  return (
    <div>
      <div className="mb-3 mt-2 px-1">
        <h1 className="text-2xl font-extrabold">設定</h1>
      </div>
      {notice && (
        <PetCard className={`mb-4 text-sm font-bold ${notice.tone === "ok" ? "bg-[#E5F8EC] text-[#06A34A]" : "bg-[#FFF8E1] text-[#8A6A00]"}`}>{notice.text}</PetCard>
      )}
      <PetSettingsForm
        walkAreas={(areas ?? []) as { id: string; lat: number; lng: number; label: string | null }[]}
        lostAlertOptIn={s?.lost_alert_opt_in ?? true}
        hereAlertOptIn={s?.here_alert_opt_in ?? false}
        lineLinked={Boolean(s?.line_user_id)}
        lineNotify={s?.line_notify ?? true}
        lineReady={lineConfigured()}
      />
      <p className="mt-6 px-2 text-center text-[11px] leading-relaxed text-[#B39C8C]">
        ワンコ手帳はLOCAPASSのアカウントで動いています。
        <br />
        手帳・通院の記録はあなただけが見られます。
      </p>
    </div>
  );
}
