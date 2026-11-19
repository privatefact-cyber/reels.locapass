import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** おでかけの共有は LOCAPASS snap の投稿画面に一本化した。古いリンクは、そちらへ送る(施設は ?shop= を引き継ぐ)。 */
export default async function PetOutingRedirect({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  const { shop } = await searchParams;
  redirect(shop && UUID.test(shop) ? `/photo/new?shop=${shop}` : "/photo/new");
}
