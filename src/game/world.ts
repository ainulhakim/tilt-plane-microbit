/**
 * world.ts — Dunia 3D game Tilt Plane.
 *
 * Berisi lautan low-poly bergelombang, pulau di kiri/kanan jalur, awan,
 * matahari/bulan, pencahayaan — dengan 5 BIOME yang berganti seiring level:
 * Laut → Gurun → Salju → Kota Malam → Antariksa.
 * Semua geometri dibuat sekali saat createWorld — tanpa tekstur/aset eksternal.
 * Gaya: low-poly ceria.
 */
import * as THREE from 'three'
import { GAME } from '../types'

/** Warna langit default (biome Laut) — diganti setBiome(). */
const SKY_COLOR = 0x87ceeb

const DESPAWN_Z = GAME.DESPAWN_Z // 20 — di belakang kamera
const SPAWN_Z = GAME.SPAWN_Z // -170 — muncul di depan
/** Jarak minimal jalur pulau dari sumbu pesawat (x=0). */
const ISLAND_LANE_GAP = 26
/** Lebar pita x untuk penempatan pulau setelah melewati gap. */
const ISLAND_X_SPREAD = 26
/** Batas x penyebaran awan (awan boleh melintang di atas jalur). */
const CLOUD_X_SPREAD = 70
/** Kelipatan kecepatan scroll awan (lebih lambat dari pulau). */
const CLOUD_SPEED_FACTOR = 0.3
/** Kecepatan putar baling-baling (rad/detik). */
const PROPELLER_SPIN = 28
/** Jumlah pulau/dekorasi besar yang di-recycle. */
const ISLAND_COUNT = 10
/** Jumlah butir salju & bintang. */
const SNOW_COUNT = 260
const STAR_COUNT = 380

const COLORS = {
  sea: 0x2f9be0,
  sand: 0xf0d488,
  hill: 0x5cbf4e,
  trunk: 0x8a5a33,
  leaf: 0x2e9e4f,
  pine: 0x2d6a4f,
  snowCap: 0xffffff,
  cactus: 0x4f9d4f,
  tower: 0x1c2436,
  window: 0xffd76a,
  rock: 0x8d8d99,
  cloud: 0xffffff,
  sun: 0xfff3ae,
  body: 0xff7f2a,
  wing: 0xffd23f,
  nose: 0xffffff,
  cockpit: 0x2f7fe0,
  prop: 0x4a4a55,
  hub: 0x33333d,
} as const

/* ============================================================
 * DUNIA (ground, pulau, awan, matahari/bulan, salju, bintang, lampu)
 * ============================================================ */

export interface World {
  update(dt: number, speed: number): void
  /** Ganti biome (0..BIOMES.length-1) — warna, dekorasi, cahaya. */
  setBiome(biomeIndex: number): void
  dispose(): void
}

export function createWorld(scene: THREE.Scene): World {
  // ---- 1. Langit & kabut ----
  scene.background = new THREE.Color(SKY_COLOR)
  scene.fog = new THREE.Fog(SKY_COLOR, 60, 220)

  // Kumpulan resource untuk dispose() yang rapi.
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const owned: THREE.Object3D[] = []

  const trackGeometry = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g)
    return g
  }
  const trackMaterial = <T extends THREE.Material>(m: T): T => {
    materials.push(m)
    return m
  }

  // ---- 2. Lampu: ambient + directional (matahari/bulan) ----
  const ambient = new THREE.AmbientLight(0xffffff, 0.85)
  const dirLight = new THREE.DirectionalLight(0xfff4d6, 1.6)
  dirLight.position.set(40, 80, -60)
  scene.add(ambient, dirLight)
  owned.push(ambient, dirLight)

  // ---- 3. Matahari/bulan: disc pucat jauh di langit ----
  const sunGeo = trackGeometry(new THREE.CircleGeometry(10, 24))
  const sunMat = trackMaterial(
    new THREE.MeshBasicMaterial({ color: COLORS.sun, fog: false }),
  )
  const sunMesh = new THREE.Mesh(sunGeo, sunMat)
  sunMesh.position.set(55, 78, -175)
  scene.add(sunMesh)
  owned.push(sunMesh)

  // ---- 4. Ground low-poly bergelombang (laut/pasir/salju/awan kota/langit antariksa) ----
  const seaGeo = trackGeometry(new THREE.PlaneGeometry(800, 800, 48, 48))
  const seaMat = trackMaterial(
    new THREE.MeshLambertMaterial({ color: COLORS.sea, flatShading: true }),
  )
  const sea = new THREE.Mesh(seaGeo, seaMat)
  sea.rotation.x = -Math.PI / 2
  sea.position.y = 0
  scene.add(sea)
  owned.push(sea)

  /** Amplitudo gelombang saat ini (diubah setBiome sesuai biome). */
  let waveAmp = 0.45

  // ---- Geometri & material bersama dekorasi (dibuat sekali) ----
  const moundGeo = trackGeometry(new THREE.CylinderGeometry(1.0, 1.3, 1.0, 7))
  const hillGeo = trackGeometry(new THREE.ConeGeometry(1.7, 2.6, 6))
  const trunkGeo = trackGeometry(new THREE.CylinderGeometry(0.07, 0.12, 1.2, 5))
  trunkGeo.translate(0, 0.6, 0)
  const leafGeo = trackGeometry(new THREE.ConeGeometry(0.3, 1.0, 4))
  leafGeo.translate(0, 0.5, 0)
  const pineGeo = trackGeometry(new THREE.ConeGeometry(0.42, 0.9, 6))
  const cactusBodyGeo = trackGeometry(new THREE.CylinderGeometry(0.13, 0.16, 1.5, 6))
  cactusBodyGeo.translate(0, 0.75, 0)
  const cactusArmGeo = trackGeometry(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 6))
  const towerGeo = trackGeometry(new THREE.BoxGeometry(1, 1, 1))
  towerGeo.translate(0, 0.5, 0)
  const windowGeo = trackGeometry(new THREE.BoxGeometry(0.98, 0.16, 0.98))
  const rockGeo = trackGeometry(new THREE.DodecahedronGeometry(1.2, 0))

  const moundMat = trackMaterial(
    new THREE.MeshLambertMaterial({ color: COLORS.sand, flatShading: true }),
  )
  const hillMat = trackMaterial(
    new THREE.MeshLambertMaterial({ color: COLORS.hill, flatShading: true }),
  )
  const snowMoundMat = trackMaterial(
    new THREE.MeshLambertMaterial({ color: COLORS.snowCap, flatShading: true }),
  )
  const trunkMat = trackMaterial(
    new THREE.MeshLambertMaterial({ color: COLORS.trunk, flatShading: true }),
  )
  const leafMat = trackMaterial(
    new THREE.MeshLambertMaterial({ color: COLORS.leaf, flatShading: true }),
  )
  const pineMat = trackMaterial(
    new THREE.MeshLambertMaterial({ color: COLORS.pine, flatShading: true }),
  )
  const cactusMat = trackMaterial(
    new THREE.MeshLambertMaterial({ color: COLORS.cactus, flatShading: true }),
  )
  const towerMat = trackMaterial(
    new THREE.MeshLambertMaterial({ color: COLORS.tower, flatShading: true }),
  )
  const windowMat = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: COLORS.window,
      emissive: COLORS.window,
      emissiveIntensity: 0.9,
    }),
  )
  const rockMat = trackMaterial(
    new THREE.MeshLambertMaterial({ color: COLORS.rock, flatShading: true }),
  )

  /** Bangun satu pohon palem: batang coklat miring + 3-5 daun hijau. */
  function buildPalm(): THREE.Group {
    const palm = new THREE.Group()
    palm.add(new THREE.Mesh(trunkGeo, trunkMat))
    const leafCount = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < leafCount; i++) {
      const pivot = new THREE.Group()
      pivot.position.y = 1.2
      pivot.rotation.y = (i / leafCount) * Math.PI * 2 + Math.random() * 0.4
      const leaf = new THREE.Mesh(leafGeo, leafMat)
      leaf.rotation.z = -(0.9 + Math.random() * 0.5)
      leaf.position.x = 0.12
      leaf.scale.setScalar(0.85 + Math.random() * 0.4)
      pivot.add(leaf)
      palm.add(pivot)
    }
    palm.rotation.z = (Math.random() - 0.5) * 0.3
    palm.rotation.x = (Math.random() - 0.5) * 0.3
    palm.scale.setScalar(0.8 + Math.random() * 0.4)
    return palm
  }

  /** Kaktus: badan tegak + 1-2 lengan siku. */
  function buildCactus(): THREE.Group {
    const c = new THREE.Group()
    c.add(new THREE.Mesh(cactusBodyGeo, cactusMat))
    const arms = 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < arms; i++) {
      const armY = 0.6 + Math.random() * 0.5
      const side = i % 2 === 0 ? 1 : -1
      const horizontal = new THREE.Mesh(cactusArmGeo, cactusMat)
      horizontal.rotation.z = Math.PI / 2
      horizontal.position.set(side * 0.35, armY, 0)
      c.add(horizontal)
      const vertical = new THREE.Mesh(cactusArmGeo, cactusMat)
      vertical.position.set(side * 0.6, armY + 0.25, 0)
      c.add(vertical)
    }
    c.rotation.y = Math.random() * Math.PI * 2
    c.scale.setScalar(0.8 + Math.random() * 0.5)
    return c
  }

  /** Pinus salju: batang pendek + 2 kerucut hijau bertumpuk. */
  function buildPine(): THREE.Group {
    const p = new THREE.Group()
    p.add(new THREE.Mesh(trunkGeo, trunkMat))
    const tiers = 2
    for (let i = 0; i < tiers; i++) {
      const cone = new THREE.Mesh(pineGeo, pineMat)
      cone.position.y = 0.9 + i * 0.55
      cone.scale.setScalar(1 - i * 0.3)
      p.add(cone)
    }
    const cap = new THREE.Mesh(leafGeo, snowMoundMat)
    cap.position.y = 1.85
    cap.scale.set(0.28, 0.5, 0.28)
    p.add(cap)
    p.scale.setScalar(0.85 + Math.random() * 0.45)
    return p
  }

  /** Gedung kota malam: menara gelap + jendela menyala. */
  function buildTower(): THREE.Group {
    const t = new THREE.Group()
    const count = 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < count; i++) {
      const h = 1.6 + Math.random() * 2.6
      const w = 0.8 + Math.random() * 0.6
      const tower = new THREE.Mesh(towerGeo, towerMat)
      tower.scale.set(w, h, w)
      tower.position.set((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.9)
      t.add(tower)
      // 2-4 pita jendela menyala
      const strips = 1 + Math.floor(Math.random() * 3)
      for (let j = 0; j < strips; j++) {
        const win = new THREE.Mesh(windowGeo, windowMat)
        win.scale.set(w * 0.85, 1, w * 0.85)
        win.position.set(tower.position.x, 0.5 + ((j + 1) / (strips + 1)) * h * 0.85, tower.position.z)
        t.add(win)
      }
    }
    t.rotation.y = Math.random() * Math.PI
    t.scale.setScalar(0.9 + Math.random() * 0.6)
    return t
  }

  /** Asteroid antariksa: batu dodecahedron melayang miring. */
  function buildAsteroidIsland(): THREE.Group {
    const a = new THREE.Group()
    const rocks = 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < rocks; i++) {
      const rock = new THREE.Mesh(rockGeo, rockMat)
      rock.position.set((Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 1.2)
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      rock.scale.setScalar(0.6 + Math.random() * 0.7)
      a.add(rock)
    }
    a.scale.setScalar(0.8 + Math.random() * 0.6)
    return a
  }

  /** Bangun satu dekorasi besar sesuai biome aktif. */
  function buildIsland(deco: string): THREE.Group {
    const island = new THREE.Group()

    // Alas/mound di permukaan ground (kecuali antariksa — melayang).
    if (deco !== 'asteroid') {
      const moundMatPick =
        deco === 'pine' ? snowMoundMat : deco === 'cactus' || deco === 'palm' ? moundMat : towerMat
      const mound = new THREE.Mesh(moundGeo, deco === 'city' ? towerMat : moundMatPick)
      mound.position.y = 0.4
      mound.rotation.y = Math.random() * Math.PI
      island.add(mound)
      if (deco === 'pine') {
        const hill = new THREE.Mesh(hillGeo, snowMoundMat)
        hill.position.set((Math.random() - 0.5) * 0.7, 2.2, (Math.random() - 0.5) * 0.7)
        island.add(hill)
      }
    }

    if (deco === 'palm') {
      const palmCount = 2 + Math.floor(Math.random() * 3)
      for (let i = 0; i < palmCount; i++) {
        const palm = buildPalm()
        const angle = Math.random() * Math.PI * 2
        const radius = 0.5 + Math.random() * 0.45
        palm.position.set(Math.cos(angle) * radius, 0.9, Math.sin(angle) * radius)
        island.add(palm)
      }
    } else if (deco === 'cactus') {
      const cCount = 1 + Math.floor(Math.random() * 3)
      for (let i = 0; i < cCount; i++) {
        const c = buildCactus()
        const angle = Math.random() * Math.PI * 2
        const radius = 0.4 + Math.random() * 0.5
        c.position.set(Math.cos(angle) * radius, 0.85, Math.sin(angle) * radius)
        island.add(c)
      }
    } else if (deco === 'pine') {
      const pCount = 2 + Math.floor(Math.random() * 3)
      for (let i = 0; i < pCount; i++) {
        const p = buildPine()
        const angle = Math.random() * Math.PI * 2
        const radius = 0.4 + Math.random() * 0.55
        p.position.set(Math.cos(angle) * radius, 0.85, Math.sin(angle) * radius)
        island.add(p)
      }
    } else if (deco === 'city') {
      const t = buildTower()
      t.position.y = 0.9
      island.add(t)
    } else {
      const a = buildAsteroidIsland()
      island.add(a)
    }

    island.userData.kind = 'island'
    return island
  }

  /** Skala pulau acak — variasi ukuran tiap spawn/recycle. */
  function randomizeIslandTransform(island: THREE.Object3D, side: number): void {
    island.position.x = side * (ISLAND_LANE_GAP + Math.random() * ISLAND_X_SPREAD)
    island.scale.setScalar(0.7 + Math.random() * 0.7)
    island.rotation.y = Math.random() * Math.PI * 2
  }

  // ---- 5. Pulau & awan: semua dalam satu grup 'movers' ----
  const movers = new THREE.Group()
  movers.name = 'movers'
  scene.add(movers)
  owned.push(movers)

  let currentDeco = 'palm'
  function spawnIslands(): void {
    for (let i = 0; i < ISLAND_COUNT; i++) {
      const island = buildIsland(currentDeco)
      const side = i % 2 === 0 ? -1 : 1
      randomizeIslandTransform(island, side)
      island.position.z =
        SPAWN_Z + (i / (ISLAND_COUNT - 1)) * (DESPAWN_Z - SPAWN_Z) + (Math.random() - 0.5) * 12
      movers.add(island)
    }
  }
  spawnIslands()

  // ---- Awan low-poly: gabungan 2-4 sphere, ketinggian 25-40 ----
  const cloudGeo = trackGeometry(new THREE.SphereGeometry(1, 7, 5))
  const cloudMat = trackMaterial(
    new THREE.MeshLambertMaterial({ color: COLORS.cloud, flatShading: true }),
  )

  const CLOUD_COUNT = 8
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = new THREE.Group()
    const puffCount = 2 + Math.floor(Math.random() * 3)
    for (let j = 0; j < puffCount; j++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat)
      puff.position.set((j - (puffCount - 1) / 2) * 1.4, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.9)
      puff.scale.setScalar(0.9 + Math.random() * 1.0)
      cloud.add(puff)
    }
    cloud.userData.kind = 'cloud'
    cloud.position.set(
      (Math.random() - 0.5) * 2 * CLOUD_X_SPREAD,
      25 + Math.random() * 15,
      SPAWN_Z + (i / (CLOUD_COUNT - 1)) * (DESPAWN_Z - SPAWN_Z) + (Math.random() - 0.5) * 30,
    )
    movers.add(cloud)
  }

  /** Recycle anak movers yang sudah lewat kamera ke posisi spawn baru. */
  function recycle(child: THREE.Object3D): void {
    child.position.z = SPAWN_Z - Math.random() * 80
    if (child.userData.kind === 'cloud') {
      child.position.x = (Math.random() - 0.5) * 2 * CLOUD_X_SPREAD
      child.position.y = 25 + Math.random() * 15
    } else {
      randomizeIslandTransform(child, Math.random() < 0.5 ? -1 : 1)
    }
  }

  // ---- Salju (biome Salju) & bintang (Kota Malam / Antariksa) ----
  const snowPos = new Float32Array(SNOW_COUNT * 3)
  for (let i = 0; i < SNOW_COUNT; i++) {
    snowPos[i * 3] = (Math.random() - 0.5) * 140
    snowPos[i * 3 + 1] = Math.random() * 40
    snowPos[i * 3 + 2] = SPAWN_Z + Math.random() * (DESPAWN_Z - SPAWN_Z)
  }
  const snowGeo = trackGeometry(new THREE.BufferGeometry())
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3))
  const snowMat = trackMaterial(new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, transparent: true, opacity: 0.9 }))
  const snow = new THREE.Points(snowGeo, snowMat)
  snow.visible = false
  scene.add(snow)
  owned.push(snow)

  const starPos = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI * 0.45 // hanya kubah atas
    const r = 260 + Math.random() * 60
    starPos[i * 3] = Math.cos(theta) * Math.sin(phi) * r
    starPos[i * 3 + 1] = Math.cos(phi) * r * 0.7 + 20
    starPos[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r - 60
  }
  const starGeo = trackGeometry(new THREE.BufferGeometry())
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const starMat = trackMaterial(new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, fog: false }))
  const stars = new THREE.Points(starGeo, starMat)
  stars.visible = false
  scene.add(stars)
  owned.push(stars)

  // ---- setBiome: ganti warna, cahaya, dekorasi ----
  function setBiome(biomeIndex: number): void {
    const idx = Math.max(0, Math.min(GAME.BIOMES.length - 1, biomeIndex))
    const b = GAME.BIOMES[idx]
    if (b.deco === currentDeco && (scene.background as THREE.Color).getHex() === b.sky) return
    currentDeco = b.deco

    ;(scene.background as THREE.Color).set(b.sky)
    ;(scene.fog as THREE.Fog).color.set(b.sky)
    seaMat.color.set(b.ground)
    waveAmp = b.wave
    sunMat.color.set(b.sun)
    ambient.intensity = b.ambient
    dirLight.intensity = b.dir

    stars.visible = b.deco === 'city' || b.deco === 'asteroid'
    snow.visible = b.deco === 'pine'

    // Rebuild dekorasi besar sesuai biome (posisi z & sisi dipertahankan).
    const olds = movers.children.filter((c) => c.userData.kind !== 'cloud')
    for (const o of olds) movers.remove(o)
    spawnIslands()
  }

  let time = 0

  return {
    update(dt: number, speed: number): void {
      time += dt

      // Gelombang: amplitudo tergantung biome (laut berombak, antariksa nyaris datar).
      const pos = seaGeo.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const y = pos.getY(i)
        pos.setZ(
          i,
          Math.sin(x * 0.16 + time * 1.7) * waveAmp * 0.9 +
            Math.cos(y * 0.12 + time * 1.15) * waveAmp * 0.7,
        )
      }
      pos.needsUpdate = true

      for (const child of movers.children) {
        const mult = child.userData.kind === 'cloud' ? CLOUD_SPEED_FACTOR : 1
        child.position.z += speed * dt * mult
        if (child.position.z > DESPAWN_Z) recycle(child)
      }

      // Salju turun (hanya biome Salju)
      if (snow.visible) {
        const sp = snowGeo.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < sp.count; i++) {
          let y = sp.getY(i) - dt * 6
          let z = sp.getZ(i) + speed * dt * 0.8
          if (y < 0) y = 40
          if (z > DESPAWN_Z) z = SPAWN_Z
          sp.setY(i, y)
          sp.setZ(i, z)
        }
        sp.needsUpdate = true
      }
    },

    setBiome,

    dispose(): void {
      for (const obj of owned) scene.remove(obj)
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
      scene.background = null
      scene.fog = null
    },
  }
}

/* ============================================================
 * PESAWAT (menghadap arah -z, menjauh dari kamera)
 * ============================================================ */

export interface Plane {
  group: THREE.Group
  spinPropeller(dt: number): void
}

export function createPlane(): Plane {
  const flat = (color: number) =>
    new THREE.MeshLambertMaterial({ color, flatShading: true })
  const bodyMat = flat(COLORS.body)
  const wingMat = flat(COLORS.wing)
  const noseMat = flat(COLORS.nose)
  const cockpitMat = flat(COLORS.cockpit)
  const propMat = flat(COLORS.prop)
  const hubMat = flat(COLORS.hub)

  const group = new THREE.Group()

  // Badan oranye: kapsul dibaringkan mengikuti sumbu z (origin di tengah).
  const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.7, 4, 10)
  bodyGeo.rotateX(Math.PI / 2)
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  group.add(body)

  // Hidung putih di ujung depan (-z).
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), noseMat)
  nose.scale.set(1, 1, 0.72)
  nose.position.z = -1.35
  group.add(nose)

  // Baling-baling di ujung terdepan: hub silinder (sumbu z) + 2 blade box tipis.
  const propeller = new THREE.Group()
  propeller.position.z = -1.66

  const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.24, 8)
  hubGeo.rotateX(Math.PI / 2)
  propeller.add(new THREE.Mesh(hubGeo, hubMat))

  const bladeGeo = new THREE.BoxGeometry(0.16, 1.15, 0.06)
  bladeGeo.translate(0, 0.58, 0) // pivot blade di hub
  const bladeA = new THREE.Mesh(bladeGeo, propMat)
  const bladeB = new THREE.Mesh(bladeGeo, propMat)
  bladeB.rotation.z = Math.PI // blade kedua berlawanan arah
  propeller.add(bladeA, bladeB)
  group.add(propeller)

  // Sayap kuning: box tipis melebar sumbu x.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 0.9), wingMat)
  wing.position.set(0, 0.12, 0.1)
  group.add(wing)

  // Ekor kuning: stabilizer horizontal + sirip vertikal.
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.5), wingMat)
  tailWing.position.set(0, 0.12, 1.25)
  group.add(tailWing)

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.55), wingMat)
  fin.position.set(0, 0.45, 1.28)
  group.add(fin)

  // Kokpit biru: setengah bola di punggung badan.
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    cockpitMat,
  )
  cockpit.position.set(0, 0.4, -0.35)
  group.add(cockpit)

  return {
    group,
    spinPropeller(dt: number): void {
      propeller.rotation.z += dt * PROPELLER_SPIN
    },
  }
}
