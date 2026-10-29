/**
 * 一覧・グリッドで、写真のない店(自前の表紙・アイコンも、リール画像も無い店)を、後ろへ回す。
 * 写真が無いタイルは、イメージ写真か暗い背景になり、スクロール中に出てくると見栄えが悪いため。
 * 並びは安定(元の順序を保つ)。店がリールを投稿すれば、その画像が使われて写真ありになり、元の位置に戻る。
 */
export function sinkWithoutPhoto<T>(items: T[], hasPhoto: (item: T) => boolean): T[] {
  const withPhoto: T[] = [];
  const without: T[] = [];
  for (const item of items) (hasPhoto(item) ? withPhoto : without).push(item);
  return [...withPhoto, ...without];
}

/** イメージ写真(スクリプトで集めた仮の素材 /placeholders/)ではなく、店が自分で用意した写真か。 */
export function hasRealPhoto(url: string | null | undefined): boolean {
  return !!url && !/\/placeholders(-thumb)?\//.test(url);
}
