/**
 * Reader micro:bit via Web Serial API (Chrome/Edge desktop).
 *
 * Protokol serial: baris angka tilt dari micro:bit, mis. "412,-230"
 * atau "x:412" / "y:-230" (diparse oleh ./parser).
 *
 * Aliran data:
 *  raw → normalisasi (x/520, y dibalik & dibagi 520) → clamp -1..1
 *      → deadzone → smoothing lerp → onInput(displayedX, displayedY)
 */
import { GAME } from '../types'
import { splitChunks, type ParsedValues } from './parser'

export type MicrobitState =
  | 'unsupported'
  | 'disconnected'
  | 'connecting'
  | 'connected-nodata'
  | 'ok'
  | 'error'

export interface MicrobitStatus {
  state: MicrobitState
  message?: string
  rate: number
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Tipe minimal Web Serial API (belum ada di lib.dom TypeScript).
// Deklarasi lokal (scope modul) supaya tidak mengganggu tipe global.
// ---------------------------------------------------------------------------
interface SerialSignals {
  dataTerminalReady?: boolean
  requestToSend?: boolean
  break?: boolean
}

interface SerialPortOpenOptions {
  baudRate: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd'
  bufferSize?: number
  flowControl?: 'none' | 'hardware'
}

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: SerialPortOpenOptions): Promise<void>
  close(): Promise<void>
  setSignals(signals: SerialSignals): Promise<void>
}

interface SerialLike {
  requestPort(options?: {
    filters?: Array<{ usbVendorId?: number; usbProductId?: number }>
  }): Promise<SerialPortLike>
}

type NavigatorWithSerial = Navigator & { serial?: SerialLike }

// ---------------------------------------------------------------------------
// Konstanta
// ---------------------------------------------------------------------------
const BAUD_RATE = 115200
const SMOOTHING = 0.5 // lerp per sampel: displayed += (target - displayed) * 0.5
const RATE_WINDOW_MS = 1000 // jendela rolling rate (sampel per detik)
const STATUS_EMIT_MIN_MS = 150 // throttle emit status akibat aliran data

const MSG_UNSUPPORTED = 'Pakai Chrome atau Edge di laptop/PC'
const MSG_SECURITY =
  'Buka game ini di tab baru (halaman yang sudah dipublish) supaya bisa tersambung ke micro:bit'
const MSG_NODATA =
  'Tersambung, tapi belum ada data dari micro:bit. Pastikan: (1) kode sudah di-flash ke micro:bit, (2) tab editor MakeCode/Python sudah ditutup, (3) cabut dan colok ulang kabel USB, (4) pilih port bernama mbed / micro:bit.'
const MSG_LOST = 'Koneksi ke micro:bit terputus. Klik Hubungkan lagi (kalau gagal, cabut-colok kabel USB dulu).'
const MSG_OPEN_FAILED =
  'Port micro:bit tidak bisa dibuka — biasanya masih dipakai aplikasi/tab lain. Tutup semuanya, cabut-colok kabel USB, lalu klik Hubungkan lagi.'
const MSG_GENERIC =
  'Terjadi masalah koneksi micro:bit. Cabut-colok kabel USB, tutup aplikasi lain, lalu klik Hubungkan lagi.'

export class MicrobitReader {
  status: MicrobitStatus = { state: 'disconnected', rate: 0, x: 0, y: 0 }

  private statusCbs: Array<(s: MicrobitStatus) => void> = []
  private inputCbs: Array<(x: number, y: number) => void> = []
  private btnCbs: Array<(a: boolean, b: boolean) => void> = []

  private port: SerialPortLike | null = null
  private reader: ReadableStreamDefaultReader<string> | null = null
  private keepReading = false
  private connecting = false
  private disposed = false

  private watchdog: ReturnType<typeof setInterval> | null = null
  private sampleTimes: number[] = []
  private openedAt = 0
  private lastDataAt = 0

  private displayedX = 0
  private displayedY = 0
  private lastStatusEmit = 0

  onStatus(cb: (s: MicrobitStatus) => void): void {
    this.statusCbs.push(cb)
  }

  onInput(cb: (x: number, y: number) => void): void {
    this.inputCbs.push(cb)
  }

  /** Status tombol micro:bit (A=rem, B=gas) — dikirim tiap sampel berisi field tombol. */
  onButtons(cb: (a: boolean, b: boolean) => void): void {
    this.btnCbs.push(cb)
  }

  async connect(): Promise<void> {
    if (this.disposed || this.connecting || this.port) return
    this.connecting = true

    try {
      const serial = (navigator as NavigatorWithSerial).serial
      if (!('serial' in navigator) || !serial) {
        this.setStatus('unsupported', MSG_UNSUPPORTED)
        return
      }

      this.setStatus('connecting')

      let port: SerialPortLike
      try {
        port = await serial.requestPort()
      } catch (e) {
        this.handleError(e)
        return
      }

      this.port = port

      try {
        await port.open({ baudRate: BAUD_RATE })
      } catch (e) {
        this.port = null
        void port.close().catch(() => {})
        this.handleError(e)
        return
      }

      // DTR: banyak micro:bit butuh sinyal ini sebelum mengirim data.
      // Gagal di sini tidak fatal (sebagian kabel/board tidak mendukung).
      try {
        await port.setSignals({ dataTerminalReady: true })
      } catch {
        /* abaikan */
      }

      this.openedAt = Date.now()
      this.lastDataAt = 0
      this.keepReading = true
      this.setStatus('connected-nodata', MSG_NODATA)
      this.startWatchdog()
      void this.readLoop()
    } finally {
      this.connecting = false
    }
  }

  async disconnect(): Promise<void> {
    await this.cleanupConnection()
    this.resetValues()
    this.setStatus('disconnected')
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.statusCbs = []
    this.inputCbs = []
    void this.disconnect()
  }

  // -------------------------------------------------------------------------

  private async readLoop(): Promise<void> {
    const port = this.port
    if (!port || !port.readable) return

    let buffer = ''
    try {
      // Cast: lib.dom mengetik writable TextDecoderStream sebagai BufferSource,
      // tidak persis cocok dengan generic pipeThrough milik Uint8Array.
      const decoder = new TextDecoderStream() as unknown as ReadableWritablePair<
        string,
        Uint8Array
      >
      const reader = port.readable.pipeThrough(decoder).getReader()
      this.reader = reader

      while (this.keepReading) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          buffer += value
          const { values, rest } = splitChunks(buffer)
          buffer = rest
          for (const v of values) this.handleValue(v)
        }
      }
    } catch (e) {
      if (this.keepReading && !this.disposed) {
        this.failSilently()
        this.handleError(e)
        return
      }
    }

    // Stream selesai sendiri tanpa error (mis. kabel dicabut).
    if (this.keepReading && !this.disposed) {
      this.failSilently()
      this.setStatus('disconnected', MSG_LOST)
    }
  }

  private handleValue(v: ParsedValues): void {
    const now = Date.now()
    this.sampleTimes.push(now)
    this.pruneSamples(now)
    this.lastDataAt = now

    const targetX = v.x !== undefined ? this.normalizeAxis(v.x) : this.displayedX
    const targetY = v.y !== undefined ? this.normalizeAxis(-v.y) : this.displayedY // Y dibalik
    this.displayedX += (targetX - this.displayedX) * SMOOTHING
    this.displayedY += (targetY - this.displayedY) * SMOOTHING

    if (v.a !== undefined || v.b !== undefined) {
      const a = (v.a ?? 0) !== 0
      const b = (v.b ?? 0) !== 0
      for (const cb of this.btnCbs) cb(a, b)
    }

    if (this.status.state !== 'ok') this.setStatus('ok')

    this.status.x = this.displayedX
    this.status.y = this.displayedY
    this.status.rate = this.sampleTimes.length

    for (const cb of this.inputCbs) cb(this.displayedX, this.displayedY)
    this.emitStatusThrottled(now)
  }

  /** Skala tilt mentah → -1..1, clamp + deadzone. (Tanda Y sudah dibalik pemanggil.) */
  private normalizeAxis(raw: number): number {
    const scaled = raw / GAME.MICROBIT_SCALE
    const clamped = Math.max(-1, Math.min(1, scaled))
    return Math.abs(clamped) < GAME.INPUT_DEADZONE ? 0 : clamped
  }

  private startWatchdog(): void {
    this.stopWatchdog()
    this.watchdog = setInterval(() => {
      const now = Date.now()
      this.pruneSamples(now)

      const idleFor = this.lastDataAt > 0 ? now - this.lastDataAt : now - this.openedAt
      if (this.status.state === 'ok' && idleFor > GAME.MICROBIT_TIMEOUT_MS) {
        this.status.rate = 0
        this.setStatus('connected-nodata', MSG_NODATA)
        return
      }
      // rate melambat secara natural (jendela rolling bergeser)
      if (this.status.state === 'ok' && this.status.rate !== this.sampleTimes.length) {
        this.status.rate = this.sampleTimes.length
        this.emitStatusThrottled(now)
      }
    }, 250)
  }

  private stopWatchdog(): void {
    if (this.watchdog !== null) {
      clearInterval(this.watchdog)
      this.watchdog = null
    }
  }

  private pruneSamples(now: number): void {
    while (this.sampleTimes.length > 0 && now - this.sampleTimes[0] > RATE_WINDOW_MS) {
      this.sampleTimes.shift()
    }
  }

  private handleError(e: unknown): void {
    const err = e as { name?: string; message?: string } | null
    const name = err?.name

    if (name === 'NotFoundError') {
      // User batal memilih port — bukan error.
      this.resetValues()
      this.setStatus('disconnected')
      return
    }
    if (name === 'SecurityError') {
      this.resetValues()
      this.setStatus('error', MSG_SECURITY)
      return
    }
    const msg = err?.message || ''
    if (name === 'NetworkError') {
      // Chrome memakai NetworkError untuk dua kasus: gagal membuka port dan
      // perangkat hilang saat membaca. Bedakan lewat pesan.
      this.setStatus('error', /open serial port|open port/i.test(msg) ? MSG_OPEN_FAILED : MSG_LOST)
      return
    }
    if (name === 'InvalidStateError') {
      this.setStatus('error', MSG_OPEN_FAILED)
      return
    }
    this.resetValues()
    this.setStatus('error', MSG_GENERIC + ' (' + (msg || String(e)) + ')')
  }

  /** Bersih-bersih saat koneksi gagal/putus dari sisi readLoop. */
  private failSilently(): void {
    void this.cleanupConnection()
  }

  /**
   * Lepas reader lock + tutup port (best-effort).
   * WAJIB: kalau port tidak ditutup, handle lama tetap mengunci perangkat di OS
   * dan percobaan Hubungkan berikutnya gagal "Failed to open serial port".
   */
  private async cleanupConnection(): Promise<void> {
    this.keepReading = false
    this.stopWatchdog()
    const reader = this.reader
    this.reader = null
    const port = this.port
    this.port = null
    if (reader) {
      try {
        await reader.cancel()
      } catch {
        /* abaikan */
      }
      try {
        reader.releaseLock()
      } catch {
        /* abaikan */
      }
    }
    if (port) {
      try {
        await port.close()
      } catch {
        /* abaikan */
      }
    }
    this.resetValues()
  }

  private resetValues(): void {
    this.sampleTimes = []
    this.lastDataAt = 0
    this.displayedX = 0
    this.displayedY = 0
    this.status.x = 0
    this.status.y = 0
    this.status.rate = 0
  }

  private setStatus(state: MicrobitState, message?: string): void {
    const changed = this.status.state !== state || this.status.message !== message
    this.status.state = state
    this.status.message = message
    if (changed) this.emitStatus()
  }

  private emitStatusThrottled(now: number): void {
    if (now - this.lastStatusEmit < STATUS_EMIT_MIN_MS) return
    this.lastStatusEmit = now
    this.emitStatus()
  }

  private emitStatus(): void {
    const snapshot: MicrobitStatus = { ...this.status }
    for (const cb of [...this.statusCbs]) cb(snapshot)
  }
}
