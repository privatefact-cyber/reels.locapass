import sharp from "sharp";
import { adBannerProblem } from "@/lib/recommend/adBannerSpec";

/** サーバー側の確認。ブラウザの確認は迂回できるので、必ずここでも画像の中身(実際の縦横)を調べて、規格に合わなければ止める。 */
export async function assertAdBanner(file: File): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  let width = 0;
  let height = 0;
  let format = "";
  try {
    const meta = await sharp(buffer).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
    format = meta.format ?? "";
  } catch {
    throw new Error("画像を読み取れませんでした。別の画像で試してください");
  }
  const type = format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : format === "webp" ? "image/webp" : `image/${format}`;
  const problem = adBannerProblem({ width, height, bytes: buffer.length, type });
  if (problem) throw new Error(problem);
}
