/** Schema.orgの構造化データ(JSON-LD)を埋め込む汎用コンポーネント。 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // 名前・自己紹介文などユーザー入力由来の値に "</script>" が含まれていても
  // スクリプトタグを閉じて任意のHTML/JSが注入されないよう、"<" をエスケープしておく。
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    // eslint-disable-next-line react/no-danger
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  );
}
