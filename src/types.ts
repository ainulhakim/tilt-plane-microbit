/**
 * Kontrak bersama seluruh modul game Tilt Plane.
 * Angka-angka gameplay ada di sini agar mudah disetel.
 */

export const GAME = {
  SPEED_START: 38,
  SPEED_ACCEL: 1.15, // per detik sampai SPEED_MAX
  SPEED_MAX: 75,
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

export type InputSource = 'microbit' | 'keyboard' | 'touch' | 'none'

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
