import * as THREE from 'three'
import { GAME } from '../types'
import type { EntityEvent } from '../types'

/** Jarak tabrakan pesawat ↔ mine (3D). */
const MINE_HIT_DIST = 2.3
/** Drift maksimum (satuan dunia) per langkah spawn ring agar jalur tetap reachable. */
const RING_DRIFT_MAX = 5
/** Durasi animasi ring lolos (scale 1 → 1.8 sambil fade). */
const PASSED_ANIM_SEC = 0.7
/** Durasi fade ring yang terlewat. */
const MISSED_FADE_SEC = 0.55
/** Jumlah percobaan mencari posisi mine yang bebas dari ring. */
const MINE_FIND_ATTEMPTS = 12
/** Mine harus menjauh dari semua ring pada rentang z ±10. */
const MINE_RING_CLEAR_Z = 10
/** Mine mulai muncul setelah ring ke-6. */
const MINE_START_AFTER_RINGS = 6

interface RingEntry {
  mesh: THREE.Mesh
  mat: THREE.MeshStandardMaterial
  state: 'idle' | 'passed' | 'missed'
  /** Waktu berjalan animasi fade/pecah. */
  t: number
}

interface MineEntry {
  group: THREE.Group
  spinX: number
  spinY: number
}

interface BirdEntry {
  group: THREE.Group
  wingL: THREE.Mesh
  wingR: THREE.Mesh
  baseY: number
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export interface EntitySystems {
  spawnInitial(): void
  update(
    dt: number,
    speed: number,
    planeX: number,
    planeY: number,
    invincible: boolean,
    level: number,
  ): EntityEvent[]
  reset(): void
}

export function createEntitySystems(scene: THREE.Scene): EntitySystems {
  // Aset geometri/material bersama — dibuat sekali, tidak di-dispose per entitas.
  // Koin emas: silinder pipih menghadap pesawat (sumbu z), berputar seperti koin.
  const ringGeo = new THREE.CylinderGeometry(1.9, 1.9, 0.3, 24)
  ringGeo.rotateX(Math.PI / 2)
  const ringMatBase = new THREE.MeshStandardMaterial({
    color: 0xffc23d, // emas
    emissive: 0xffcc00, // kuning menyala
    emissiveIntensity: 0.55,
    metalness: 0.55,
    roughness: 0.35,
    transparent: true,
    opacity: 1,
  })
  const mineBodyGeo = new THREE.SphereGeometry(1.1, 20, 14)
  const mineBodyMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.6,
    metalness: 0.35,
  })
  const spikeGeo = new THREE.ConeGeometry(0.22, 0.9, 8)
  const spikeMat = new THREE.MeshStandardMaterial({
    color: 0xd81f2a, // merah
    emissive: 0x4a0000,
    roughness: 0.45,
  })

  const rings: RingEntry[] = []
  const mines: MineEntry[] = []
  const birds: BirdEntry[] = []

  let ringsSpawned = 0 // total koin sejak awal run (penjadwalan mine)
  let combo = 0
  let lastRingX = 0 // posisi target koin terakhir (acuan drift)
  let lastRingY: number = GAME.RING_START_Y
  let lastRingZ: number | null = null // z koin terakhir, digeser numerik tiap frame
  let nextMineZ: number = GAME.SPAWN_Z
  let nextBirdZ: number = GAME.SPAWN_Z
  let birdTime = 0

  // Aset burung (rintangan bergerak)
  const birdBodyGeo = new THREE.ConeGeometry(0.45, 1.3, 6)
  birdBodyGeo.rotateX(Math.PI / 2) // moncong mengarah +z (ke arah pemain)
  const birdBodyMat = new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.5 })
  const birdWingGeo = new THREE.BoxGeometry(1.5, 0.08, 0.5)
  birdWingGeo.translate(0.75, 0, 0) // pivot di akar sayap
  const birdWingMat = new THREE.MeshStandardMaterial({
    color: 0x5a6a7a,
    roughness: 0.5,
    side: THREE.DoubleSide,
  })

  function buildBird(): { group: THREE.Group; wingL: THREE.Mesh; wingR: THREE.Mesh } {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(birdBodyGeo, birdBodyMat))
    const wingL = new THREE.Mesh(birdWingGeo, birdWingMat)
    wingL.position.set(0.15, 0.15, 0.1)
    const wingR = new THREE.Mesh(birdWingGeo, birdWingMat)
    wingR.position.set(-0.15, 0.15, 0.1)
    wingR.scale.x = -1 // cermin biar ke sisi kiri
    group.add(wingL, wingR)
    return { group, wingL, wingR }
  }

  function spawnBird(z: number): void {
    const xLimit = GAME.X_LIMIT - 2
    const { group, wingL, wingR } = buildBird()
    const baseY = rand(GAME.Y_MIN, GAME.Y_MAX)
    group.position.set(rand(-xLimit, xLimit), baseY, z)
    scene.add(group)
    birds.push({ group, wingL, wingR, baseY })
  }

  function removeBird(entry: BirdEntry): void {
    scene.remove(entry.group)
    const i = birds.indexOf(entry)
    if (i >= 0) birds.splice(i, 1)
  }

  function spawnRing(x: number, y: number, z: number): void {
    const mat = ringMatBase.clone()
    const mesh = new THREE.Mesh(ringGeo, mat)
    mesh.position.set(x, y, z)
    scene.add(mesh)
    rings.push({ mesh, mat, state: 'idle', t: 0 })
    ringsSpawned++
    lastRingX = x
    lastRingY = y
    lastRingZ = z
  }

  function removeRing(entry: RingEntry): void {
    scene.remove(entry.mesh)
    entry.mat.dispose() // material di-clone per ring
    const i = rings.indexOf(entry)
    if (i >= 0) rings.splice(i, 1)
  }

  function buildMineGroup(): THREE.Group {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(mineBodyGeo, mineBodyMat))
    const spikeCount = 8 + Math.floor(Math.random() * 5) // 8..12 spike
    const golden = Math.PI * (3 - Math.sqrt(5)) // distribusi fibonacci sphere
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < spikeCount; i++) {
      const yDir = 1 - (2 * i + 1) / spikeCount
      const r = Math.sqrt(Math.max(0, 1 - yDir * yDir))
      const theta = golden * i + rand(-0.25, 0.25)
      const dir = new THREE.Vector3(Math.cos(theta) * r, yDir, Math.sin(theta) * r).normalize()
      const spike = new THREE.Mesh(spikeGeo, spikeMat)
      spike.position.copy(dir).multiplyScalar(1.1 + 0.32) // sedikit menancap di bola
      spike.quaternion.setFromUnitVectors(up, dir) // cone default menghadap +y
      group.add(spike)
    }
    return group
  }

  function spawnMine(z: number): void {
    const xLimit = GAME.X_LIMIT - 2
    let x = rand(-xLimit, xLimit)
    let y = rand(GAME.Y_MIN, GAME.Y_MAX)
    // Cari posisi yang berjarak aman dari SEMUA ring aktif pada rentang z ±10.
    for (let attempt = 0; attempt < MINE_FIND_ATTEMPTS; attempt++) {
      const cx = rand(-xLimit, xLimit)
      const cy = rand(GAME.Y_MIN, GAME.Y_MAX)
      let ok = true
      for (const r of rings) {
        if (Math.abs(r.mesh.position.z - z) > MINE_RING_CLEAR_Z) continue
        const dx = r.mesh.position.x - cx
        const dy = r.mesh.position.y - cy
        if (Math.hypot(dx, dy) < GAME.MINE_SAFE_DIST) {
          ok = false
          break
        }
      }
      x = cx
      y = cy
      if (ok) break
    }
    const group = buildMineGroup()
    group.position.set(x, y, z)
    scene.add(group)
    mines.push({ group, spinX: rand(0.5, 1.1), spinY: rand(0.7, 1.5) })
  }

  function removeMine(entry: MineEntry): void {
    scene.remove(entry.group)
    const i = mines.indexOf(entry)
    if (i >= 0) mines.splice(i, 1)
  }

  function spawnInitial(): void {
    // 4 ring pertama: garis lurus x=0 pada ketinggian RING_START_Y — mudah untuk pemula.
    for (let i = 0; i < GAME.RING_START_COUNT; i++) {
      spawnRing(0, GAME.RING_START_Y, -60 - i * GAME.RING_SPACING_Z)
    }
    nextMineZ = GAME.SPAWN_Z
  }

  function update(
    dt: number,
    speed: number,
    planeX: number,
    planeY: number,
    invincible: boolean,
    level: number,
  ): EntityEvent[] {
    const events: EntityEvent[] = []
    const dz = speed * dt
    birdTime += dt

    // ---- Koin: gerak +z, putar, deteksi tepuk, animasi fade ----
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]
      const oldZ = r.mesh.position.z
      const newZ = oldZ + dz
      r.mesh.position.z = newZ
      if (r.state === 'idle') r.mesh.rotation.y += dt * 2.6 // koin berputar

      // Ring baru saja melewati bidang pesawat (z = 0)
      if (r.state === 'idle' && oldZ < 0 && newZ >= 0) {
        const dist = Math.hypot(r.mesh.position.x - planeX, r.mesh.position.y - planeY)
        if (dist < GAME.RING_HIT_DIST) {
          r.state = 'passed'
          r.t = 0
          r.mat.color.set(0x2ecc71) // berubah hijau
          r.mat.emissive.set(0x00ff66)
          combo = Math.min(combo + 1, GAME.COMBO_MAX)
          events.push({ type: 'ring-passed', combo })
        } else {
          r.state = 'missed'
          r.t = 0
          combo = 0
          events.push({ type: 'ring-missed' })
        }
      }

      if (r.state === 'passed') {
        // Membesar (scale 1 → 1.8) sambil fade out
        r.t += dt
        const k = Math.min(r.t / PASSED_ANIM_SEC, 1)
        r.mesh.scale.setScalar(1 + 0.8 * k)
        r.mat.opacity = 1 - k
        if (k >= 1) {
          removeRing(r)
          continue
        }
      } else if (r.state === 'missed') {
        // Fade out biasa
        r.t += dt
        r.mat.opacity = Math.max(0, 1 - r.t / MISSED_FADE_SEC)
        if (r.mat.opacity <= 0) {
          removeRing(r)
          continue
        }
      }

      if (newZ > GAME.DESPAWN_Z) removeRing(r)
    }

    // ---- Spawn ring berkelanjutan: jaga jarak RING_SPACING_Z dari ring terakhir ----
    if (lastRingZ !== null) {
      lastRingZ += dz
      while (lastRingZ - GAME.RING_SPACING_Z >= GAME.SPAWN_Z) {
        const nx = clamp(
          lastRingX + rand(-RING_DRIFT_MAX, RING_DRIFT_MAX),
          -(GAME.X_LIMIT - 3),
          GAME.X_LIMIT - 3,
        )
        const ny = clamp(
          lastRingY + rand(-RING_DRIFT_MAX, RING_DRIFT_MAX),
          GAME.Y_MIN + 2,
          GAME.Y_MAX - 2,
        )
        spawnRing(nx, ny, lastRingZ - GAME.RING_SPACING_Z)
      }
    }

    // ---- Mine: gerak +z, rotasi, tabrakan, despawn ----
    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i]
      const p = m.group.position
      p.z += dz
      m.group.rotation.x += m.spinX * dt
      m.group.rotation.y += m.spinY * dt

      if (!invincible) {
        const dx = p.x - planeX
        const dy = p.y - planeY
        if (Math.sqrt(dx * dx + dy * dy + p.z * p.z) < MINE_HIT_DIST) {
          events.push({ type: 'mine-hit' })
          combo = 0
          removeMine(m)
          continue
        }
      }

      if (p.z > GAME.DESPAWN_Z) removeMine(m)
    }

    // ---- Spawn mine berkelanjutan (mulai setelah ring ke-6) ----
    if (ringsSpawned >= MINE_START_AFTER_RINGS) {
      while (nextMineZ >= GAME.SPAWN_Z) {
        spawnMine(nextMineZ)
        nextMineZ -= GAME.MINE_SPACING_Z
      }
    }

    // ---- Burung: rintangan bergerak, mulai level >= BIRD_START_LEVEL ----
    nextBirdZ += dz
    if (level >= GAME.BIRD_START_LEVEL) {
      while (nextBirdZ >= GAME.SPAWN_Z) {
        spawnBird(nextBirdZ)
        nextBirdZ -= GAME.BIRD_SPACING_Z
      }
    } else {
      nextBirdZ = GAME.SPAWN_Z // tahan agar tidak menumpuk sebelum level cukup
    }
    for (let i = birds.length - 1; i >= 0; i--) {
      const bd = birds[i]
      const p = bd.group.position
      p.z += dz
      p.y = bd.baseY + Math.sin(birdTime * 2.2 + p.z * 0.12) * 1.5
      const flap = Math.sin(birdTime * 13 + p.z) * 0.55
      bd.wingL.rotation.z = flap
      bd.wingR.rotation.z = -flap

      if (!invincible) {
        const dx = p.x - planeX
        const dy = p.y - planeY
        if (Math.sqrt(dx * dx + dy * dy + p.z * p.z) < GAME.BIRD_HIT_DIST) {
          events.push({ type: 'mine-hit' })
          combo = 0
          removeBird(bd)
          continue
        }
      }

      if (p.z > GAME.DESPAWN_Z) removeBird(bd)
    }

    return events
  }

  function reset(): void {
    for (let i = rings.length - 1; i >= 0; i--) removeRing(rings[i])
    for (let i = mines.length - 1; i >= 0; i--) removeMine(mines[i])
    for (let i = birds.length - 1; i >= 0; i--) removeBird(birds[i])
    ringsSpawned = 0
    combo = 0
    lastRingX = 0
    lastRingY = GAME.RING_START_Y
    lastRingZ = null
    nextMineZ = GAME.SPAWN_Z
    nextBirdZ = GAME.SPAWN_Z
  }

  return { spawnInitial, update, reset }
}
