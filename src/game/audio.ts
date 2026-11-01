/**
 * Audio game Tilt Plane — murni Web Audio API (oscillator + gain envelope).
 * Tidak memakai file audio. Semua method no-op sebelum unlock() dipanggil.
 */
export class GameAudio {
  private ctx: AudioContext | null = null

  /** Buat AudioContext (idempoten) + resume() jika suspended. Panggil dari klik user. */
  unlock(): void {
    if (typeof window === 'undefined') return
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {})
    }
  }

  /** Satu nada dengan envelope attack-decay eksponensial. */
  private tone(opts: {
    freq: number
    endFreq?: number // pitch bend menuju frekuensi ini (opsional)
    dur: number
    type: OscillatorType
    vol: number
    delay?: number
  }): void {
    const ctx = this.ctx
    if (!ctx) return // unlock() belum dipanggil → no-op
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = opts.type
    osc.frequency.setValueAtTime(opts.freq, t0)
    if (opts.endFreq !== undefined && opts.endFreq > 0) {
      osc.frequency.exponentialRampToValueAtTime(opts.endFreq, t0 + opts.dur)
    }
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(opts.vol, t0 + 0.012) // attack cepat
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur) // decay ke senyap
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + opts.dur + 0.02)
  }

  /** Beep pendek saat lolos ring; pitch naik mengikuti combo (semi-ton). */
  ring(combo: number): void {
    const step = Math.max(0, Math.min(combo - 1, 12))
    this.tone({
      freq: 660 * Math.pow(2, step / 12),
      dur: 0.14,
      type: 'triangle',
      vol: 0.22,
    })
  }

  /** Suara tabrakan: dua oscillator rendah dengan pitch bend turun. */
  crash(): void {
    this.tone({ freq: 130, endFreq: 40, dur: 0.35, type: 'sawtooth', vol: 0.3 })
    this.tone({ freq: 70, endFreq: 30, dur: 0.3, type: 'square', vol: 0.18 })
  }

  /** Game over: tiga nada menurun. */
  gameover(): void {
    this.tone({ freq: 440, dur: 0.22, type: 'triangle', vol: 0.25 })
    this.tone({ freq: 330, dur: 0.22, type: 'triangle', vol: 0.25, delay: 0.22 })
    this.tone({ freq: 220, dur: 0.4, type: 'triangle', vol: 0.25, delay: 0.44 })
  }
}
