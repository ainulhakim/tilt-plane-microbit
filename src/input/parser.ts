/**
 * Parser murni untuk data serial dari micro:bit.
 * Tidak ada dependensi DOM/browser — mudah dites dengan vitest.
 *
 * Format yang ditangani (regex ekstraksi angka, urutan x sebelum y):
 *  - "412,-230" / "412 -230" / "(412, -230)"  → {x, y}
 *  - "x:412"   → {x:412}   (gaya MakeCode, satu baris per sumbu)
 *  - "y:-230"  → {y:-230}
 *  - "-230"    → {y:-230}  (angka tunggal dianggap sumbu Y)
 *  - tanpa angka / kosong → null
 */

export interface ParsedValues {
  x?: number
  y?: number
  /** Tombol A micro:bit (0/1) — field ke-3 baris "x,y,a,b". */
  a?: number
  /** Tombol B micro:bit (0/1) — field ke-4 baris "x,y,a,b". */
  b?: number
}

/** Angka bulat/desimal, boleh negatif: -230, 412.5, -230.5 */
const NUMBER_RE = /-?\d+(?:\.\d+)?/g

/**
 * Parse satu baris data tilt.
 * Baris dengan awalan "x:" / "y:" dipaksa ke sumbu tersebut (gaya MakeCode);
 * dua angka berarti pasangan x,y; satu angka tanpa awalan dianggap Y.
 */
export function parseLine(line: string): ParsedValues | null {
  if (line == null) return null
  const trimmed = line.trim()
  if (trimmed.length === 0) return null

  const matches = trimmed.match(NUMBER_RE)
  if (!matches || matches.length === 0) return null

  if (matches.length >= 2) {
    const out: ParsedValues = { x: Number(matches[0]), y: Number(matches[1]) }
    if (matches.length >= 3) out.a = Number(matches[2]) // tombol A (rem)
    if (matches.length >= 4) out.b = Number(matches[3]) // tombol B (gas)
    return out
  }

  const value = Number(matches[0])
  const isXAxis = /^\s*x\s*:/i.test(trimmed)
  return isXAxis ? { x: value } : { y: value }
}

/**
 * Pecah buffer serial pada '\n' (trim '\r' tiap baris) lalu parse tiap baris
 * lengkap. Baris terakhir yang belum diakhiri '\n' dikembalikan utuh
 * sebagai `rest` untuk diakumulasi dengan chunk berikutnya.
 */
export function splitChunks(buffer: string): { values: ParsedValues[]; rest: string } {
  const values: ParsedValues[] = []
  const parts = buffer.split('\n')
  const rest = parts.pop() ?? ''

  for (const part of parts) {
    const line = part.replace(/\r/g, '').trim()
    const parsed = parseLine(line)
    if (parsed !== null) values.push(parsed)
  }

  return { values, rest }
}
