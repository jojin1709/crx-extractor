// Web Crypto API hash calculator for files and packages

export interface FileHashResult {
  sha256: string;
  sha1: string;
  md5: string;
}

// Convert ArrayBuffer to Hex string
function bufToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// Simple pure JS MD5 for client-side hashing without external deps
function md5(bytes: Uint8Array): string {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  const n = bytes.length;
  const blocks: number[] = [];
  for (let i = 0; i < n; i++) {
    blocks[i >> 2] |= (bytes[i] & 0xff) << ((i % 4) * 8);
  }
  blocks[n >> 2] |= 0x80 << ((n % 4) * 8);
  blocks[(((n + 8) >> 6) + 1) * 16 - 1] = n * 8;

  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < blocks.length; i += 16) {
    const olda = a, oldb = b, oldc = c, oldd = d;

    a = md5ff(a, b, c, d, blocks[i] || 0, 7, -680876936);
    d = md5ff(d, a, b, c, blocks[i + 1] || 0, 12, -389564586);
    c = md5ff(c, d, a, b, blocks[i + 2] || 0, 17, 606105819);
    b = md5ff(b, c, d, a, blocks[i + 3] || 0, 22, -1044525330);
    a = md5ff(a, b, c, d, blocks[i + 4] || 0, 7, -176418897);
    d = md5ff(d, a, b, c, blocks[i + 5] || 0, 12, 1200080426);
    c = md5ff(c, d, a, b, blocks[i + 6] || 0, 17, -1473231341);
    b = md5ff(b, c, d, a, blocks[i + 7] || 0, 22, -45705983);
    a = md5ff(a, b, c, d, blocks[i + 8] || 0, 7, 1770035416);
    d = md5ff(d, a, b, c, blocks[i + 9] || 0, 12, -1958414417);
    c = md5ff(c, d, a, b, blocks[i + 10] || 0, 17, -42063);
    b = md5ff(b, c, d, a, blocks[i + 11] || 0, 22, -1990404162);
    a = md5ff(a, b, c, d, blocks[i + 12] || 0, 7, 1804603682);
    d = md5ff(d, a, b, c, blocks[i + 13] || 0, 12, -40341101);
    c = md5ff(c, d, a, b, blocks[i + 14] || 0, 17, -1502002290);
    b = md5ff(b, c, d, a, blocks[i + 15] || 0, 22, 1236535329);

    a = md5gg(a, b, c, d, blocks[i + 1] || 0, 5, -165796510);
    d = md5gg(d, a, b, c, blocks[i + 6] || 0, 9, -1069501632);
    c = md5gg(c, d, a, b, blocks[i + 11] || 0, 14, 643717713);
    b = md5gg(b, c, d, a, blocks[i] || 0, 20, -373897302);
    a = md5gg(a, b, c, d, blocks[i + 5] || 0, 5, -701558691);
    d = md5gg(d, a, b, c, blocks[i + 10] || 0, 9, 38016083);
    c = md5gg(c, d, a, b, blocks[i + 15] || 0, 14, -660478335);
    b = md5gg(b, c, d, a, blocks[i + 4] || 0, 20, -405537848);
    a = md5gg(a, b, c, d, blocks[i + 9] || 0, 5, 568446438);
    d = md5gg(d, a, b, c, blocks[i + 14] || 0, 9, -1019803690);
    c = md5gg(c, d, a, b, blocks[i + 3] || 0, 14, -187363961);
    b = md5gg(b, c, d, a, blocks[i + 8] || 0, 20, 1163531501);
    a = md5gg(a, b, c, d, blocks[i + 13] || 0, 5, -1444681467);
    d = md5gg(d, a, b, c, blocks[i + 2] || 0, 9, -51403784);
    c = md5gg(c, d, a, b, blocks[i + 7] || 0, 14, 1735328473);
    b = md5gg(b, c, d, a, blocks[i + 12] || 0, 20, -1926607734);

    a = md5hh(a, b, c, d, blocks[i + 5] || 0, 4, -378558);
    d = md5hh(d, a, b, c, blocks[i + 8] || 0, 11, -2022574463);
    c = md5hh(c, d, a, b, blocks[i + 11] || 0, 16, 1839030562);
    b = md5hh(b, c, d, a, blocks[i + 14] || 0, 23, -35309556);
    a = md5hh(a, b, c, d, blocks[i + 1] || 0, 4, -1530992060);
    d = md5hh(d, a, b, c, blocks[i + 4] || 0, 11, 1272893353);
    c = md5hh(c, d, a, b, blocks[i + 7] || 0, 16, -155497632);
    b = md5hh(b, c, d, a, blocks[i + 10] || 0, 23, -1094730640);
    a = md5hh(a, b, c, d, blocks[i + 13] || 0, 4, 681279174);
    d = md5hh(d, a, b, c, blocks[i] || 0, 11, -358537222);
    c = md5hh(c, d, a, b, blocks[i + 3] || 0, 16, -722521979);
    b = md5hh(b, c, d, a, blocks[i + 6] || 0, 23, 76029189);
    a = md5hh(a, b, c, d, blocks[i + 9] || 0, 4, -640364487);
    d = md5hh(d, a, b, c, blocks[i + 12] || 0, 11, -421815835);
    c = md5hh(c, d, a, b, blocks[i + 15] || 0, 16, 530742520);
    b = md5hh(b, c, d, a, blocks[i + 2] || 0, 23, -995338651);

    a = md5ii(a, b, c, d, blocks[i] || 0, 6, -198630844);
    d = md5ii(d, a, b, c, blocks[i + 7] || 0, 10, 1126891415);
    c = md5ii(c, d, a, b, blocks[i + 14] || 0, 15, -1416354905);
    b = md5ii(b, c, d, a, blocks[i + 5] || 0, 21, -57434055);
    a = md5ii(a, b, c, d, blocks[i + 12] || 0, 6, 1700485571);
    d = md5ii(d, a, b, c, blocks[i + 3] || 0, 10, -1894986606);
    c = md5ii(c, d, a, b, blocks[i + 10] || 0, 15, -1051523);
    b = md5ii(b, c, d, a, blocks[i + 1] || 0, 21, -2054922799);
    a = md5ii(a, b, c, d, blocks[i + 8] || 0, 6, 1873313359);
    d = md5ii(d, a, b, c, blocks[i + 15] || 0, 10, -30611744);
    c = md5ii(c, d, a, b, blocks[i + 6] || 0, 15, -1560198380);
    b = md5ii(b, c, d, a, blocks[i + 13] || 0, 21, 1309151649);
    a = md5ii(a, b, c, d, blocks[i + 4] || 0, 6, -145523070);
    d = md5ii(d, a, b, c, blocks[i + 11] || 0, 10, -1120210379);
    c = md5ii(c, d, a, b, blocks[i + 2] || 0, 15, 718787259);
    b = md5ii(b, c, d, a, blocks[i + 9] || 0, 21, -343485551);

    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  const hexChars = "0123456789abcdef";
  let output = "";
  const words = [a, b, c, d];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const byte = (words[i] >> (j * 8)) & 0xff;
      output += hexChars.charAt((byte >> 4) & 0x0f) + hexChars.charAt(byte & 0x0f);
    }
  }
  return output;
}

export async function calculateHashes(data: Uint8Array | ArrayBuffer | string): Promise<FileHashResult> {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }

  const rawBuffer = new Uint8Array(bytes).buffer as ArrayBuffer;

  let sha256 = "";
  let sha1 = "";

  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const [hash256Buf, hash1Buf] = await Promise.all([
        crypto.subtle.digest("SHA-256", rawBuffer),
        crypto.subtle.digest("SHA-1", rawBuffer)
      ]);
      sha256 = bufToHex(hash256Buf);
      sha1 = bufToHex(hash1Buf);
    } catch {
      sha256 = "unavailable";
      sha1 = "unavailable";
    }
  }

  const md5Hash = md5(bytes);

  return {
    sha256,
    sha1,
    md5: md5Hash
  };
}
