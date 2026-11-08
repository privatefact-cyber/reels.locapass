/**
 * Supabase(PostgREST)は、1回の問い合わせで返す行数に上限(既定1000件)がある。それを超えると、エラーにならず、
 * 途中で切れた結果が返ってくる。店舗が増えても全件を集めたいときは、この関数で、範囲を区切って全部取る。
 * build(from, to) には、`.range(from, to)` を付けた問い合わせを返す。
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxRows = 50000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(`一覧の取得に失敗しました: ${error.message}`);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}
