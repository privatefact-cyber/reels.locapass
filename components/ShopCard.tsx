import Link from "next/link";

export function ShopCard({
  id,
  name,
  area,
  genre,
}: {
  id: string;
  name: string;
  area: string | null;
  genre: string | null;
}) {
  return (
    <Link
      href={`/images/no-image.jpg
      className="block rounded-lg border border-black/10 bg-white p-4 transition hover:border-brand hover:shadow-md"
    >
      <p className="text-xs text-black/50">
        {area ?? "エリア未設定"} / {genre ?? "ジャンル未設定"}
      </p>
      <h3 className="mt-1 text-lg font-semibold">{name}</h3>
    </Link>
  );
}
