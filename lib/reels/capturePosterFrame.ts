"use client";

/** 動画の先頭付近から1フレームを切り出し、サムネイル用のJPEG Blobを返す。失敗時はnull。 */
export async function capturePosterFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    const fail = () => {
      cleanup();
      resolve(null);
    };

    const timeout = window.setTimeout(fail, 8000);

    video.onerror = () => {
      window.clearTimeout(timeout);
      fail();
    };

    video.onloadedmetadata = () => {
      // 先頭は真っ黒/フェードインのフレームになりがちなので少し進めた位置を狙う。
      const seekTo = Math.min(0.3, Math.max(0, (video.duration || 1) * 0.05));
      video.currentTime = seekTo;
    };

    video.onseeked = () => {
      window.clearTimeout(timeout);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx || !canvas.width || !canvas.height) {
        fail();
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          cleanup();
          resolve(blob);
        },
        "image/jpeg",
        0.8,
      );
    };
  });
}
