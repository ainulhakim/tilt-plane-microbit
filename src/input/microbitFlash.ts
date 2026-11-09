// Inject firmware ke micro:bit langsung dari browser (WebUSB / DAPLink vendor flash).
// Pola dapjs: requestDevice → WebUSB transport → DAPLink.connect → flash(hex) → disconnect.
// micro:bit DAPLink: VID 0x0d28 / PID 0x0204, vendor interface class 0xFF.
// Dipakai tombol "Inject Firmware" di menu (GameCanvas) — fallback: unduh .hex manual.
// dapjs di dynamic-import biar bundle utama tetap ringan (dibutuhkan hanya saat klik Inject).

export const MICROBIT_USB = { vendorId: 0x0d28, productId: 0x0204 }

export type FlashState = 'idle' | 'connecting' | 'downloading' | 'flashing' | 'done' | 'error'

export interface FlashStatus {
  state: FlashState
  /** 0..1 saat state === 'flashing' */
  progress?: number
  /** Pesan Indonesia saat state === 'error' */
  message?: string
}

export function usbFlashSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator
}

let busy = false

export async function flashFirmware(hexUrl: string, onStatus: (s: FlashStatus) => void): Promise<void> {
  if (busy) return
  if (!usbFlashSupported()) {
    onStatus({
      state: 'error',
      message:
        'Browser ini belum mendukung WebUSB. Pakai Chrome/Edge di laptop (atau Chrome Android + kabel OTG), atau pakai tombol Unduh .hex lalu copy manual ke drive MICROBIT.',
    })
    return
  }
  busy = true
  let daplink: import('dapjs').DAPLink | null = null
  try {
    onStatus({ state: 'connecting' })
    const device = await navigator.usb.requestDevice({ filters: [MICROBIT_USB] })
    const { DAPLink, WebUSB } = await import('dapjs')
    daplink = new DAPLink(new WebUSB(device))
    daplink.on(DAPLink.EVENT_PROGRESS, (progress: number) => {
      onStatus({ state: 'flashing', progress })
    })
    await daplink.connect()
    onStatus({ state: 'downloading' })
    const res = await fetch(hexUrl)
    if (!res.ok) throw new Error(`unduh firmware gagal (HTTP ${res.status})`)
    const buf = await res.arrayBuffer()
    await daplink.flash(buf)
    try {
      await daplink.disconnect()
    } catch {
      /* board reboot setelah flash — normal */
    }
    onStatus({ state: 'done' })
  } catch (e) {
    const err = e as Error & { name?: string }
    const name = err?.name || ''
    const msg = err?.message || String(e)
    try {
      if (daplink) await daplink.disconnect()
    } catch {
      /* best-effort */
    }
    if (name === 'NotFoundError') {
      // user menutup dialog pilih perangkat — bukan error
      onStatus({ state: 'idle' })
    } else if (/No valid interfaces|claim|interface/i.test(msg)) {
      onStatus({
        state: 'error',
        message:
          'micro:bit terdeteksi tapi mode inject terkunci — biasanya USB masih dipakai aplikasi/tab lain (MakeCode, editor Python, serial). Tutup semuanya, cabut-colok kabel USB, lalu coba lagi. Atau pakai Unduh .hex (copy ke drive MICROBIT).',
      })
    } else if (/Bad status|Flash error|Bad response/i.test(msg)) {
      onStatus({
        state: 'error',
        message:
          'Proses inject terganggu di tengah jalan. Cabut-colok kabel USB micro:bit, tunggu 5 detik, lalu coba lagi. (Jangan cabut kabel saat progress masih jalan ya!)',
      })
    } else {
      onStatus({
        state: 'error',
        message: `Inject gagal (${msg || name}). Cabut-colok kabel USB lalu ulangi, atau pakai Unduh .hex dan copy manual ke drive MICROBIT.`,
      })
    }
  } finally {
    busy = false
  }
}
