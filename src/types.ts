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
  // Gas & rem (keyboard F/V, tombol sentuh HP, micro:bit B/A)
  GAS_ACCEL: 20, // tambahan kecepatan per detik saat gas ditekan
  BRAKE_DECEL: 38, // pengurangan kecepatan per detik saat rem ditekan
  GAS_CAP_RATIO: 1.25, // batas atas saat gas = preset.max × 1,25
  BRAKE_FLOOR_RATIO: 0.6, // batas bawah saat rem = preset.start × 0,6
  SPEED_MIN_HARD: 12, // kecepatan absolut minimal
  // Level 0..100 — naik tiap LEVEL_SPAN satuan jarak tempuh; biome berubah tiap 20 level
  LEVEL_SPAN: 300,
  MAX_LEVEL: 100,
  // Burung (rintangan bergerak) — mulai muncul di level ≥ BIRD_START_LEVEL
  BIRD_SPACING_Z: 46,
  BIRD_START_LEVEL: 12,
  BIRD_HIT_DIST: 2.1,
  BIOMES: [
    { name: 'Laut', emoji: '🌊', sky: 0x87ceeb, ground: 0x2f9be0, wave: 0.45, ambient: 0.85, dir: 1.6, sun: 0xfff3ae, deco: 'palm' },
    { name: 'Gurun', emoji: '🏜️', sky: 0xf6c478, ground: 0xd9a45b, wave: 0.14, ambient: 0.9, dir: 1.5, sun: 0xfff0c0, deco: 'cactus' },
    { name: 'Salju', emoji: '❄️', sky: 0xdfe9f5, ground: 0xeef4fb, wave: 0.2, ambient: 1.0, dir: 1.15, sun: 0xeef4ff, deco: 'pine' },
    { name: 'Kota Malam', emoji: '🏙️', sky: 0x131c33, ground: 0x0f1e38, wave: 0.3, ambient: 0.5, dir: 0.55, sun: 0xdfe8ff, deco: 'city' },
    { name: 'Antariksa', emoji: '🚀', sky: 0x04050e, ground: 0x0a0a1e, wave: 0.1, ambient: 0.4, dir: 0.5, sun: 0x9fb8ff, deco: 'asteroid' },
  ],
  LEVELS_PER_BIOME: 20,
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
