/**
 * 最小のストリーミングZIP(無圧縮=STORE)。動画・写真はすでに圧縮されているので、圧縮せず流すだけにして、
 * メモリに全体をためない(1ファイルずつ、受け取った分をそのまま書き出す)。
 * サイズが先に分からないので「データ記述子」(フラグのビット3)を使い、ファイル名はUTF-8(ビット11)。
 * 1ファイル4GB未満・全体4GB未満・65,535ファイル未満の範囲(ZIP64は使わない)。
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32Update(crc: number, chunk: Uint8Array): number {
  let c = crc;
  for (let i = 0; i < chunk.length; i++) c = CRC_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export type ZipEntry = { name: string; modified: Date; body: ReadableStream<Uint8Array> };

/** entries を順に読みながらZIPを書き出すReadableStream。entriesは遅延生成(必要になった時点で取りに行く)。 */
export function zipStream(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = entries[Symbol.asyncIterator]();
  const central: Uint8Array[] = [];
  let offset = 0;
  let count = 0;
  let finished = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) {
        controller.close();
        return;
      }
      const next = await iterator.next();
      if (next.done) {
        const centralSize = central.reduce((n, c) => n + c.length, 0);
        for (const c of central) controller.enqueue(c);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, count, true);
        end.setUint16(10, count, true);
        end.setUint32(12, centralSize, true);
        end.setUint32(16, offset, true);
        controller.enqueue(new Uint8Array(end.buffer));
        finished = true;
        controller.close();
        return;
      }

      const entry = next.value;
      const name = encoder.encode(entry.name);
      const { time, date } = dosDateTime(entry.modified);
      const localOffset = offset;

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0808, true); // データ記述子 + UTF-8
      local.setUint16(8, 0, true); // STORE
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint16(26, name.length, true);
      const header = new Uint8Array(30 + name.length);
      header.set(new Uint8Array(local.buffer), 0);
      header.set(name, 30);
      controller.enqueue(header);
      offset += header.length;

      let crc = 0xffffffff;
      let size = 0;
      const reader = entry.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        crc = crc32Update(crc, value);
        size += value.length;
        controller.enqueue(value);
      }
      offset += size;
      const finalCrc = (crc ^ 0xffffffff) >>> 0;

      const desc = new DataView(new ArrayBuffer(16));
      desc.setUint32(0, 0x08074b50, true);
      desc.setUint32(4, finalCrc, true);
      desc.setUint32(8, size, true);
      desc.setUint32(12, size, true);
      controller.enqueue(new Uint8Array(desc.buffer));
      offset += 16;

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0808, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, time, true);
      cen.setUint16(14, date, true);
      cen.setUint32(16, finalCrc, true);
      cen.setUint32(20, size, true);
      cen.setUint32(24, size, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, localOffset, true);
      const centralEntry = new Uint8Array(46 + name.length);
      centralEntry.set(new Uint8Array(cen.buffer), 0);
      centralEntry.set(name, 46);
      central.push(centralEntry);
      count++;
    },
  });
}
