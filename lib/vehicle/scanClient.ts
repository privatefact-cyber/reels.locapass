import type { VehicleCertFields } from "@/lib/vehicle/vehicleCert";

const MAX_EDGE = 1800;

/** 車検証の文字が読めるよう、長辺1800pxのJPEGに縮める(送る量を減らす。縮められなければ元のまま)。 */
async function toJpegBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    return { base64: dataUrl.split(",")[1], mimeType: "image/jpeg" };
  } catch {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { base64: btoa(bin), mimeType: file.type || "image/jpeg" };
  }
}

/** 車検証の写真を読み取る。同じサイトのAPIを呼ぶ(LOCAPASSの管理画面用。ログインはCookie)。 */
export async function scanVehicleCert(shopId: string, file: File): Promise<VehicleCertFields> {
  const { base64, mimeType } = await toJpegBase64(file);
  const res = await fetch("/api/vehicle-cert/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopId, imageBase64: base64, mimeType }),
  });
  const data = (await res.json().catch(() => ({}))) as { fields?: VehicleCertFields; error?: string };
  if (!res.ok || !data.fields) throw new Error(data.error ?? "読み取りに失敗しました");
  return data.fields;
}
