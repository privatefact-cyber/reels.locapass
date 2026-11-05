import Link from "next/link";
import { getPetViewer } from "@/lib/pet/db";
import { FoundReportForm } from "@/components/pet/FoundReportForm";

export const dynamic = "force-dynamic";

export default async function FoundNewPage() {
  // 拾った人・見かけた人はアプリも会員登録もしていないことが多いので、ログインなしでも送れる
  const viewer = await getPetViewer();
  return (
    <div>
      <div className="mb-4 mt-2 px-1">
        <p className="text-xs font-bold text-[#B39C8C]">ご協力ありがとうございます</p>
        <h1 className="text-2xl font-extrabold">迷子のペットを見つけました</h1>
        <p className="mt-1 text-sm text-[#9C8273]">写真と場所を送ると、近くで探している飼い主さんに通知が届き、LINEやXでも広められます。</p>
      </div>
      {!viewer && (
        <p className="mb-3 px-1 text-xs text-[#9C8273]">
          LOCAPASSの会員の方は
          <Link href={`/mypage/login?redirect=${encodeURIComponent("/pet/found/new")}`} className="mx-1 font-bold text-[#EE6A36] underline">
            ログイン
          </Link>
          してから送ると、返事が通知で届きます。
        </p>
      )}
      <FoundReportForm loggedIn={Boolean(viewer)} />
    </div>
  );
}
