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
    return { x: Number(matches[0]), y: Number(matches[1]) }
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
