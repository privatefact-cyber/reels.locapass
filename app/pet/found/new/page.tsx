import { requirePetViewer } from "@/lib/pet/db";
import { FoundReportForm } from "@/components/pet/FoundReportForm";

export const dynamic = "force-dynamic";

export default async function FoundNewPage() {
  await requirePetViewer("/pet/found/new");
  return (
    <div>
      <div className="mb-4 mt-2 px-1">
        <p className="text-xs font-bold text-[#B39C8C]">ご協力ありがとうございます</p>
        <h1 className="text-2xl font-extrabold">迷子のペットを見つけました</h1>
        <p className="mt-1 text-sm text-[#9C8273]">写真と場所を送ると、近くで探している飼い主さんに通知が届き、LINEやXでも広められます。</p>
      </div>
      <FoundReportForm />
    </div>
  );
}
