import { requirePetViewer } from "@/lib/pet/db";
import { PetProfileForm } from "@/components/pet/PetProfileForm";

export const dynamic = "force-dynamic";

export default async function NewPetPage() {
  await requirePetViewer("/pet/new");
  return (
    <div>
      <div className="mb-4 mt-2 px-1">
        <p className="text-xs font-bold text-[#B39C8C]">ようこそ!</p>
        <h1 className="text-2xl font-extrabold">うちの子を登録</h1>
        <p className="mt-1 text-sm text-[#9C8273]">あとから何度でも直せます。写真は登録のあとで入れられます。</p>
      </div>
      <PetProfileForm />
    </div>
  );
}
