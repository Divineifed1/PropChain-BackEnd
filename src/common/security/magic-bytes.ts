/**
 * Content sniffing (magic byte) validation for uploaded files.
 *
 * MIME type alone is attacker-controlled: a renamed `.exe` or polyglot file
 * can present any Content-Type. These signatures sniff the actual byte
 * content before persistence so spoofed extensions are rejected.
 */

export interface MagicSignature {
  offset: number;
  bytes: number[];
}

const SIGNATURES: Record<string, MagicSignature[][]> = {
  'application/pdf': [[{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }]], // %PDF
  'image/jpeg': [[{ offset: 0, bytes: [0xff, 0xd8, 0xff] }]],
  'image/png': [[{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }]],
  'image/gif': [
    [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }], // GIF87a
    [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }], // GIF89a
  ],
  // RIFF container + "WEBP" marker at offset 8 (not just "RIFF", which would
  // also match WAV/AVI, or plain 4-byte files).
  'image/webp': [
    [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
    ],
  ],
  // ISO BMFF box: "ftyp" at offset 4, brand "avif"/"avis" at offset 8.
  'image/avif': [
    [
      { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp
      { offset: 8, bytes: [0x61, 0x76, 0x69, 0x66] }, // avif
    ],
    [
      { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp
      { offset: 8, bytes: [0x61, 0x76, 0x69, 0x73] }, // avis
    ],
  ],
  // OLE2 compound document (legacy .doc)
  'application/msword': [[{ offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }]],
  // ZIP archive (OOXML .docx is a ZIP container)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
  ],
};

export function hasKnownSignature(mimeType: string): boolean {
  return mimeType in SIGNATURES;
}

/**
 * Return the trailing "%%EOF" marker of a PDF, if present within the last
 * `lookback` bytes. Guards against truncated or polyglot PDFs whose header
 * alone would pass.
 */
export function hasPdfEof(buffer: Buffer, lookback = 1024): boolean {
  const start = Math.max(0, buffer.length - lookback);
  const tail = buffer.length > lookback ? buffer.subarray(start) : buffer;
  const eof = Buffer.from('%%EOF');
  return tail.indexOf(eof) !== -1;
}

/**
 * Sniff a buffer against the signature table for `mimeType`.
 *
 * Returns true when:
 *  - the MIME type is known and every signature in at least one variant
 *    matches its bytes at the expected offsets, or
 *  - the MIME type has no registered signature (callers that rely on this
 *    must reject types not covered here explicitly).
 *
 * Returns false for a registered type whose bytes do not match, when the
 * buffer is too short to contain the signature, or for an empty buffer.
 */
export function matchesMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length === 0) {
    return false;
  }
  const signatures = SIGNATURES[mimeType];
  if (!signatures) {
    return true;
  }
  for (const variant of signatures) {
    let match = true;
    for (const part of variant) {
      if (buffer.length < part.offset + part.bytes.length) {
        match = false;
        break;
      }
      for (let i = 0; i < part.bytes.length; i++) {
        if (buffer[part.offset + i] !== part.bytes[i]) {
          match = false;
          break;
        }
      }
      if (!match) {
        break;
      }
    }
    if (match) {
      if (mimeType === 'application/pdf' && !hasPdfEof(buffer)) {
        return false;
      }
      return true;
    }
  }
  return false;
}
