import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyMetToken } from "@/lib/met/token";
import { MetConnect } from "./MetConnect";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "つながる - LOCAPASS", robots: { index: false, follow: false } };

/** FACES本人の画面のQRを読んだ人が開くページ。ログインして「つながる」を押すと、相互フォローになる。 */
export default async function MetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyMetToken(decodeURIComponent(token));

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-6 py-12 text-main">{children}</div>
  );

  if (!verified.ok) {
    return shell(
      <>
        <h1 className="text-xl font-bold">
          {verified.reason === "expired" ? "QRの有効期限が切れました" : "QRが正しくありません"}
        </h1>
        <p className="text-sm text-tone-300">相手の画面で、新しいQRを表示してもらって、もう一度読み込んでください。</p>
        <Link href="/" className="text-sm text-hl-300 underline">トップへ</Link>
      </>,
    );
  }

  const admin = createAdminClient() as any;
  const { data: cast } = await admin
    .from("locapass_cast_members")
    .select("name, avatar_url, user_id, locapass_shops ( name, status )")
    .eq("id", verified.castId)
    .maybeSingle();
  const shop = Array.isArray(cast?.locapass_shops) ? cast.locapass_shops[0] : cast?.locapass_shops;
  if (!cast?.user_id || shop?.status !== "active") {
    return shell(<h1 className="text-xl font-bold">このQRでは、つながれません</h1>);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const next = `/met/${token}`;

  return shell(
    <>
      <div className="flex flex-col items-center gap-3 text-center">
        {cast.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cast.avatar_url} alt="" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-tone-800 text-3xl font-bold text-tone-400">{cast.name.slice(0, 1)}</div>
        )}
        <h1 className="text-xl font-bold">{cast.name}</h1>
        <p className="text-sm text-tone-400">{shop.name}</p>
      </div>
      <p className="text-center text-sm text-tone-300">つながると、おたがいにフォローしあって、メッセージを送りあえるようになります。</p>
      {user ? (
        <MetConnect token={decodeURIComponent(token)} castName={cast.name} />
      ) : (
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="block rounded-full bg-hl-300 py-4 text-center text-base font-bold text-black">
          ログインして、つながる
        </Link>
      )}
    </>,
  );
}
