/** 迷子のお知らせを広めるときの文と、共有用のURL(カード・詳細ページ共通) */
export function lostShareText(r: { petName: string; breed: string | null; address: string | null }) {
  return `【迷子のワンコを探しています】${r.petName}${r.breed ? `(${r.breed})` : ""}${r.address ? ` ${r.address}付近` : ""} 見かけた方はご連絡ください。拡散お願いします #迷子犬 #ロカわん`;
}

export function lostShareUrl(id: string) {
  return `https://locapass.net/pet/lost/${id}`;
}
