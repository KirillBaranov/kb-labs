import { gzipSync } from 'node:zlib'

/** Builds a minimal valid tar.gz containing a single package.json file. */
export function createTestTarball(pkgJson: Record<string, unknown>): Buffer {
  const content = Buffer.from(JSON.stringify(pkgJson, null, 2))
  const fileName = 'package/package.json'
  const header = buildTarHeader(fileName, content.length)
  const paddedContent = padTo512(content)
  const eoa = Buffer.alloc(1024) // two 512-byte zero blocks = end-of-archive

  const tar = Buffer.concat([header, paddedContent, eoa])
  return gzipSync(tar)
}

function buildTarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512)

  writeString(header, name, 0, 100)
  writeString(header, '0000644\0', 100, 8)  // mode
  writeString(header, '0000000\0', 108, 8)  // uid
  writeString(header, '0000000\0', 116, 8)  // gid
  writeString(header, size.toString(8).padStart(11, '0') + '\0', 124, 12)  // size
  writeString(header, Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 12)  // mtime
  header.fill(0x20, 148, 156)  // checksum placeholder (spaces)
  header[156] = 0x30  // type: regular file '0'
  writeString(header, 'ustar\0', 257, 6)
  writeString(header, '00', 263, 2)

  // compute checksum
  let sum = 0
  for (let i = 0; i < 512; i++) sum += header[i]
  writeString(header, sum.toString(8).padStart(6, '0') + '\0 ', 148, 8)

  return header
}

function writeString(buf: Buffer, str: string, offset: number, len: number): void {
  const bytes = Buffer.from(str, 'utf8')
  bytes.copy(buf, offset, 0, Math.min(bytes.length, len))
}

function padTo512(buf: Buffer): Buffer {
  const rem = buf.length % 512
  if (rem === 0) return buf
  return Buffer.concat([buf, Buffer.alloc(512 - rem)])
}
