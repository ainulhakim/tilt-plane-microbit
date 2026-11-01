/**
 * Kontrak bersama seluruh modul game Tilt Plane.
 * Angka-angka gameplay ada di sini agar mudah disetel.
 */

export const GAME = {
  SPEED_START: 38,
  SPEED_ACCEL: 1.15, // per detik sampai SPEED_MAX
  SPEED_MAX: 75,
  // Preset kecepatan (mode anak-anak s.d. ngebut). "Mulai Main" memakai preset terpilih.
  SPEED_PRESETS: {
    lambat: { label: '🐢 Lambat', start: 24, max: 42, accel: 0.8 },
    normal: { label: '✈️ Normal', start: 38, max: 75, accel: 1.15 },
    cepat: { label: '🚀 Cepat', start: 50, max: 95, accel: 1.5 },
  },
  // Akrobatik 360°: saat input mendekati penuh, pesawat mulai berputar penuh (roll/loop).
  TRICK_THRESHOLD: 0.85,
  TRICK_RATE: 3.4, // radian/detik saat input penuh (≈1 putaran / 1,8 dtk)
  TRICK_RETURN: 4.5, // radian/detik kembali ke level saat input dilepas
  X_LIMIT: 22, // batas kiri/kanan pesawat
  Y_MIN: 2.2,
  Y_MAX: 22,
  RING_HIT_DIST: 2.9, // jarak lolos ring saat melewati pesawat
  RING_POINTS: 10,
  COMBO_MAX: 5,
  RING_SPACING_Z: 26, // jarak antar ring
  RING_START_COUNT: 4, // ring awal garis lurus untuk pemula
  RING_START_Y: 8,
  MINE_SPACING_Z: 34,
  MINE_SAFE_DIST: 6, // jarak minimum mine dari jalur ring
  SPAWN_Z: -170, // objek muncul di depan
  DESPAWN_Z: 20, // di belakang kamera
  START_LIVES: 3,
  INVINCIBLE_SEC: 1.6,
  INPUT_DEADZONE: 0.07,
  MICROBIT_SCALE: 520,
  MICROBIT_TIMEOUT_MS: 1000,
  INPUT_LERP: 0.18, // smoothing input per frame
} as const

export type InputSource = 'microbit' | 'gyro' | 'keyboard' | 'touch' | 'none'

export interface InputState {
  x: number // -1..1
  y: number // -1..1
  source: InputSource
}

export type GamePhase = 'menu' | 'playing' | 'gameover'

export type EntityEvent =
  | { type: 'ring-passed'; combo: number }
  | { type: 'ring-missed' }
  | { type: 'mine-hit' }

/** Posisi pesawat selalu z = 0; dunia bergerak ke arah +z (ke kamera). */
export const PLANE_Z = 0
