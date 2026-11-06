import { redirect } from "next/navigation";
import { getPetViewer } from "@/lib/pet/db";
import { PetLoginForm } from "@/components/pet/PetLoginForm";

export const dynamic = "force-dynamic";

/** ワンコ手帳のログイン・新規登録(LOCAPASSと同じアカウント)。戻り先は /pet の中だけ */
export default async function PetLoginPage({ searchParams }: { searchParams: Promise<{ redirect?: string; line_error?: string }> }) {
  const sp = await searchParams;
  const back = typeof sp.redirect === "string" && sp.redirect.startsWith("/pet") && !sp.redirect.startsWith("//") ? sp.redirect : "/pet";
  if (await getPetViewer()) redirect(back);
  return (
    <div>
      <div className="mb-4 mt-4 text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#FFD3B8] to-[#CDEFE3] text-5xl shadow-inner" aria-hidden>
          🐶
        </div>
        <h1 className="mt-3 text-2xl font-extrabold">ログイン・新規登録</h1>
        <p className="mt-1 text-sm text-[#9C8273]">無料で、うちの子の手帳がつくれます</p>
      </div>
      <PetLoginForm redirectTo={back} lineError={Boolean(sp.line_error)} />
    </div>
  );
}
