/** Chunk payload codec: raw 4096 bytes → deflate → base64. Typical modified chunk: 4 KB → ~100–400 B. */

export async function encodeChunk(data: Uint8Array): Promise<string> {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(data as unknown as BufferSource); w.close();
  const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  return b64(buf);
}

export async function decodeChunk(s: string): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(unb64(s) as unknown as BufferSource); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

function b64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
