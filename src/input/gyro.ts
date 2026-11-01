/**
 * Kendali gyro HP via DeviceOrientation API.
 * Wajib HTTPS. iOS butuh requestPermission() yang dipicu klik user.
 * Output dinormalisasi -1..1 (45° = defleksi penuh) dan mengikuti orientasi layar.
 */

export type GyroState = 'unsupported' | 'idle' | 'denied' | 'ok'

export interface GyroStatus {
  state: GyroState
  message?: string
}

interface OrientationEventLike {
  beta: number | null
  gamma: number | null
}

interface DeviceOrientationEventCtor {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

const FULL_DEFLECTION_DEG = 45

export class GyroReader {
  status: GyroStatus = { state: 'idle' }
  private statusCbs: Array<(s: GyroStatus) => void> = []
  private inputCbs: Array<(x: number, y: number) => void> = []
  private lastAt = 0
  private listening = false

  private handler = (e: Event) => {
    const oe = e as unknown as OrientationEventLike
    if (oe.beta == null || oe.gamma == null) return
    let x = 0
    let y = 0
    const angle = (
      typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : 0
    ) as 0 | 90 | 180 | 270
    switch (angle) {
      case 90:
        x = -oe.beta
        y = oe.gamma
        break
      case 180:
        x = -oe.gamma
        y = -oe.beta
        break
      case 270:
        x = oe.beta
        y = -oe.gamma
        break
      default:
        x = oe.gamma
        y = oe.beta
    }
    const clamp = (v: number) => Math.max(-1, Math.min(1, v / FULL_DEFLECTION_DEG))
    this.lastAt = performance.now()
    for (const cb of this.inputCbs) cb(clamp(x), clamp(y))
  }

  /** Data masih segar (< 0,8 detik)? */
  get fresh(): boolean {
    return this.lastAt > 0 && performance.now() - this.lastAt < 800
  }

  async start(): Promise<void> {
    const doe = (
      typeof window !== 'undefined'
        ? (window as { DeviceOrientationEvent?: DeviceOrientationEventCtor }).DeviceOrientationEvent
        : undefined
    )
    if (!doe) {
      this.emit({ state: 'unsupported', message: 'Perangkat ini tidak punya sensor gyro' })
      return
    }
    if (typeof doe.requestPermission === 'function') {
      try {
        const res = await doe.requestPermission()
        if (res !== 'granted') {
          this.emit({
            state: 'denied',
            message: 'Izin sensor gerak ditolak. Izinkan di pengaturan browser lalu coba lagi.',
          })
          return
        }
      } catch {
        this.emit({ state: 'denied', message: 'Izin gyro tidak bisa diminta. Coba lagi atau pakai sentuhan.' })
        return
      }
    }
    if (!this.listening) {
      window.addEventListener('deviceorientation', this.handler, true)
      this.listening = true
    }
    this.emit({ state: 'ok' })
  }

  stop(): void {
    if (this.listening) {
      window.removeEventListener('deviceorientation', this.handler, true)
      this.listening = false
    }
    this.lastAt = 0
    this.emit({ state: 'idle' })
  }

  onStatus(cb: (s: GyroStatus) => void): void {
    this.statusCbs.push(cb)
  }

  onInput(cb: (x: number, y: number) => void): void {
    this.inputCbs.push(cb)
  }

  private emit(s: GyroStatus): void {
    this.status = s
    for (const cb of this.statusCbs) cb(s)
  }
}
