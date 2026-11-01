import { describe, expect, it } from 'vitest'
import { parseLine, splitChunks } from './parser'

describe('parseLine', () => {
  it('"412,-230" → {x:412, y:-230}', () => {
    expect(parseLine('412,-230')).toEqual({ x: 412, y: -230 })
  })

  it('"(412, -230)" → {x:412, y:-230}', () => {
    expect(parseLine('(412, -230)')).toEqual({ x: 412, y: -230 })
  })

  it('"412 -230" (spasi, tanpa koma) → {x:412, y:-230}', () => {
    expect(parseLine('412 -230')).toEqual({ x: 412, y: -230 })
  })

  it('"x:412" gaya MakeCode → hanya x', () => {
    expect(parseLine('x:412')).toEqual({ x: 412 })
  })

  it('"y:-230" gaya MakeCode → hanya y', () => {
    expect(parseLine('y:-230')).toEqual({ y: -230 })
  })

  it('angka tunggal "-230" → y saja', () => {
    expect(parseLine('-230')).toEqual({ y: -230 })
  })

  it('"x: 412" dengan spasi setelah titik dua → {x:412}', () => {
    expect(parseLine('x: 412')).toEqual({ x: 412 })
  })

  it('angka negatif desimal "-230.5" → {y:-230.5}', () => {
    expect(parseLine('-230.5')).toEqual({ y: -230.5 })
  })

  it('dua angka desimal "412.5,-230.5" → {x:412.5, y:-230.5}', () => {
    expect(parseLine('412.5,-230.5')).toEqual({ x: 412.5, y: -230.5 })
  })

  it('baris tanpa angka → null', () => {
    expect(parseLine('halo dunia')).toBeNull()
  })

  it('baris kosong / whitespace → null', () => {
    expect(parseLine('')).toBeNull()
    expect(parseLine('   ')).toBeNull()
    expect(parseLine('\r')).toBeNull()
  })

  it('urutan x sebelum y: "y:-230,412" tetap x lalu y', () => {
    expect(parseLine('y:-230,412')).toEqual({ x: -230, y: 412 })
  })
})

describe('splitChunks', () => {
  it('multi baris lengkap → semua diparse, rest kosong', () => {
    const { values, rest } = splitChunks('412,-230\ny:-230\n')
    expect(values).toEqual([
      { x: 412, y: -230 },
      { y: -230 },
    ])
    expect(rest).toBe('')
  })

  it('buffer potongan tanpa newline di akhir → sisa dikembalikan sebagai rest', () => {
    const { values, rest } = splitChunks('412,-230\n41')
    expect(values).toEqual([{ x: 412, y: -230 }])
    expect(rest).toBe('41')
  })

  it('multi baris campur format valid/invalid → hanya valid masuk values', () => {
    const { values, rest } = splitChunks('x:412\nnoise\ny:-230.5\n\n412 -230\n-230')
    expect(values).toEqual([{ x: 412 }, { y: -230.5 }, { x: 412, y: -230 }])
    expect(rest).toBe('-230')
  })

  it("memotong '\\r' (CRLF dari Windows/serial)", () => {
    const { values } = splitChunks('412,-230\r\nx: 412\r\n')
    expect(values).toEqual([
      { x: 412, y: -230 },
      { x: 412 },
    ])
  })

  it('baris terakhir tanpa newline diparse jika sudah utuh saat newline datang', () => {
    const pertama = splitChunks('412,-230')
    expect(pertama.values).toEqual([])
    expect(pertama.rest).toBe('412,-230')

    const kedua = splitChunks(pertama.rest + '\ny:-230')
    expect(kedua.values).toEqual([{ x: 412, y: -230 }])
    expect(kedua.rest).toBe('y:-230')
  })
})
