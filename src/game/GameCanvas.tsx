import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { GAME, PLANE_Z, type GamePhase, type InputState, type EntityEvent } from '../types'
import { createWorld, createPlane, type World, type Plane } from './world'
import { createEntitySystems, type EntitySystems } from './entities'
import { GameAudio } from './audio'
import { MicrobitReader, type MicrobitStatus } from '../input/microbit'
import { GyroReader, type GyroStatus } from '../input/gyro'

interface Popup {
  id: number
  text: string
}

const FLIP_KEY = 'tiltplane-flipY'
const FLIPX_KEY = 'tiltplane-flipX'
const SPEED_KEY = 'tiltplane-speed'

type SpeedKey = keyof typeof GAME.SPEED_PRESETS
const SPEED_ORDER: SpeedKey[] = ['lambat', 'normal', 'cepat']

/** Kembalikan sudut trik ke level (0) lewat jalur terpendek saat input dilepas. */
const easeToLevel = (a: number, dt: number): number => {
  const wrapped = THREE.MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI
  const step = GAME.TRICK_RETURN * dt
  return Math.abs(wrapped) <= step ? 0 : wrapped - Math.sign(wrapped) * step
}

export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null)

  // ---------- React state khusus HUD (frekuensi rendah) ----------
  const [phase, setPhase] = useState<GamePhase>('menu')
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [lives, setLives] = useState<number>(GAME.START_LIVES)
  const [popups, setPopups] = useState<Popup[]>([])
  const [flash, setFlash] = useState(false)
  const [mbStatus, setMbStatus] = useState<MicrobitStatus>({
    state: 'disconnected',
    rate: 0,
    x: 0,
    y: 0,
  })
  const [flipY, setFlipY] = useState<boolean>(() => localStorage.getItem(FLIP_KEY) === '1')
  const [flipX, setFlipX] = useState<boolean>(() => localStorage.getItem(FLIPX_KEY) === '1')
  const [finalScore, setFinalScore] = useState(0)
  const [speedLabel, setSpeedLabel] = useState<number>(GAME.SPEED_START)
  const [speedMode, setSpeedMode] = useState<SpeedKey>(() => {
    const v = localStorage.getItem(SPEED_KEY)
    return v === 'lambat' || v === 'cepat' ? v : 'normal'
  })
  const [gyroOn, setGyroOn] = useState(false)
  const [gyroStatus, setGyroStatus] = useState<GyroStatus>({ state: 'idle' })
  const [levelLabel, setLevelLabel] = useState<{ level: number; name: string; emoji: string }>({
    level: 0,
    name: GAME.BIOMES[0].name,
    emoji: GAME.BIOMES[0].emoji,
  })
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('tiltplane-name') ?? '')
  const [leaderboard, setLeaderboard] = useState<Array<{ name: string; score: number; level: number }>>([])
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'ok' | 'fail'>('idle')

  // ---------- Semua state game berat ada di ref (60fps) ----------
  const phaseRef = useRef<GamePhase>('menu')
  const scoreRef = useRef(0)
  const livesRef = useRef<number>(GAME.START_LIVES)
  const speedRef = useRef<number>(GAME.SPEED_START)
  const invincibleRef = useRef(0)
  const inputRef = useRef<InputState>({ x: 0, y: 0.25, source: 'none' })
  const keysRef = useRef<Set<string>>(new Set())
  const touchRef = useRef<{ active: boolean; startX: number; startY: number; x: number; y: number }>({
    active: false,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
  })
  const mbInputRef = useRef<{ x: number; y: number; t: number }>({ x: 0, y: 0, t: 0 })
  const mbBtnRef = useRef({ a: false, b: false })
  const gyroInputRef = useRef<{ x: number; y: number; t: number }>({ x: 0, y: 0, t: 0 })
  const gyroActiveRef = useRef(false)
  const speedModeRef = useRef(speedMode)
  speedModeRef.current = speedMode
  const trickRef = useRef({ roll: 0, pitch: 0 })
  const gyroReaderRef = useRef<GyroReader | null>(null)
  const touchGasRef = useRef(false)
  const touchBrakeRef = useRef(false)
  const distRef = useRef(0)
  const levelRef = useRef(0)
  const worldRef = useRef<World | null>(null)
  const flipYRef = useRef(flipY)
  flipYRef.current = flipY
  const flipXRef = useRef(flipX)
  flipXRef.current = flipX
  const audioRef = useRef<GameAudio | null>(null)
  const readerRef = useRef<MicrobitReader | null>(null)
  const popupIdRef = useRef(0)
  const planeRef = useRef<{ position: THREE.Vector3; rotation: THREE.Euler } | null>(null)
  const entitiesRef = useRef<EntitySystems | null>(null)

  const addPopup = useCallback((text: string) => {
    const id = ++popupIdRef.current
    setPopups((p) => [...p.slice(-3), { id, text }])
    window.setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 900)
  }, [])

  // ---------- Inisialisasi reader micro:bit (sekali) ----------
  useEffect(() => {
    const reader = new MicrobitReader()
    readerRef.current = reader
    reader.onStatus((s) => setMbStatus({ ...s }))
    reader.onInput((x, y) => {
      mbInputRef.current = { x, y, t: performance.now() }
    })
    reader.onButtons((a, b) => {
      mbBtnRef.current = { a, b } // A=rem, B=gas
    })
    return () => {
      reader.dispose()
      readerRef.current = null
    }
  }, [])

  // ---------- Inisialisasi reader gyro HP (sekali) ----------
  useEffect(() => {
    const gyro = new GyroReader()
    gyroReaderRef.current = gyro
    gyro.onStatus((s) => setGyroStatus({ ...s }))
    gyro.onInput((x, y) => {
      gyroInputRef.current = { x, y, t: performance.now() }
    })
    return () => {
      gyro.stop()
      gyroReaderRef.current = null
    }
  }, [])

  // ---------- Keyboard listener ----------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase()))
        e.preventDefault()
    }
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // ---------- Loop utama three.js ----------
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 500)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const world: World = createWorld(scene)
    worldRef.current = world
    const plane: Plane = createPlane()
    scene.add(plane.group)
    const entities: EntitySystems = createEntitySystems(scene)
    entitiesRef.current = entities

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    // Pointer (sentuh / mouse drag) di canvas
    const pDown = (e: PointerEvent) => {
      touchRef.current = { active: true, startX: e.clientX, startY: e.clientY, x: 0, y: 0 }
    }
    const pMove = (e: PointerEvent) => {
      const t = touchRef.current
      if (!t.active) return
      t.x = THREE.MathUtils.clamp((e.clientX - t.startX) / 110, -1, 1)
      t.y = THREE.MathUtils.clamp(-(e.clientY - t.startY) / 110, -1, 1)
    }
    const pUp = () => {
      touchRef.current.active = false
      touchRef.current.x = 0
      touchRef.current.y = 0
    }
    renderer.domElement.addEventListener('pointerdown', pDown)
    window.addEventListener('pointermove', pMove)
    window.addEventListener('pointerup', pUp)

    plane.group.position.set(0, GAME.RING_START_Y, PLANE_Z)
    planeRef.current = plane.group

    let raf = 0
    let last = performance.now()
    let hudTimer = 0
    let lastLevel = 0
    let lastBiome = 0

    const targetFromInputs = (): InputState => {
      const now = performance.now()
      // 1) micro:bit segar (< 1 detik)
      if (now - mbInputRef.current.t < GAME.MICROBIT_TIMEOUT_MS) {
        const flip = flipYRef.current ? -1 : 1
        const flipXv = flipXRef.current ? -1 : 1
        return { x: mbInputRef.current.x * flipXv, y: mbInputRef.current.y * flip, source: 'microbit' }
      }
      // 2) gyro HP aktif & segar
      if (gyroActiveRef.current && gyroReaderRef.current?.fresh) {
        const flip = flipYRef.current ? -1 : 1
        const flipXv = flipXRef.current ? -1 : 1
        return { x: gyroInputRef.current.x * flipXv, y: gyroInputRef.current.y * flip, source: 'gyro' }
      }
      // 3) sentuhan aktif
      if (touchRef.current.active) {
        return { x: touchRef.current.x, y: touchRef.current.y, source: 'touch' }
      }
      // 3) keyboard
      const k = keysRef.current
      let kx = 0
      let ky = 0
      if (k.has('arrowleft') || k.has('a')) kx -= 1
      if (k.has('arrowright') || k.has('d')) kx += 1
      if (k.has('arrowup') || k.has('w')) ky += 1
      if (k.has('arrowdown') || k.has('s')) ky -= 1
      if (kx !== 0 || ky !== 0) return { x: kx, y: ky, source: 'keyboard' }
      // tanpa input: pelan-pelan kembali ke tengah
      const cur = inputRef.current
      return { x: 0, y: cur.y * 0.25, source: cur.source }
    }

    const handleEvents = (events: EntityEvent[]) => {
      for (const ev of events) {
        if (ev.type === 'ring-passed') {
          const pts = GAME.RING_POINTS * ev.combo
          scoreRef.current += pts
          setScore(scoreRef.current)
          setCombo(ev.combo)
          addPopup(`+${pts} x${ev.combo}`)
          audioRef.current?.ring(ev.combo)
        } else if (ev.type === 'mine-hit') {
          livesRef.current -= 1
          setLives(livesRef.current)
          invincibleRef.current = GAME.INVINCIBLE_SEC
          setFlash(true)
          window.setTimeout(() => setFlash(false), 300)
          audioRef.current?.crash()
          if (livesRef.current <= 0) {
            phaseRef.current = 'gameover'
            setPhase('gameover')
            setFinalScore(scoreRef.current)
            audioRef.current?.gameover()
          }
        }
        // ring-missed: combo sudah di-reset di dalam entities, tidak ada popup
      }
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      if (phaseRef.current === 'playing') {
        const preset = GAME.SPEED_PRESETS[speedModeRef.current]
        let s = speedRef.current + preset.accel * dt
        const gasHeld = keysRef.current.has('f') || touchGasRef.current || mbBtnRef.current.b
        const brakeHeld = keysRef.current.has('v') || touchBrakeRef.current || mbBtnRef.current.a
        if (gasHeld) s += GAME.GAS_ACCEL * dt
        if (brakeHeld) s -= GAME.BRAKE_DECEL * dt
        const gasCap = preset.max * GAME.GAS_CAP_RATIO
        const brakeFloor = Math.max(GAME.SPEED_MIN_HARD, preset.start * GAME.BRAKE_FLOOR_RATIO)
        speedRef.current = Math.min(gasCap, Math.max(brakeFloor, s))
        if (invincibleRef.current > 0) invincibleRef.current -= dt
        distRef.current += speedRef.current * dt
        const lv = Math.min(GAME.MAX_LEVEL, Math.floor(distRef.current / GAME.LEVEL_SPAN))
        levelRef.current = lv
        const bi = Math.min(Math.floor(lv / GAME.LEVELS_PER_BIOME), GAME.BIOMES.length - 1)
        if (bi !== lastBiome) {
          lastBiome = bi
          world.setBiome(bi)
        }
      }

      // ----- input smoothing -----
      const target = targetFromInputs()
      const inp = inputRef.current
      inp.x += (target.x - inp.x) * GAME.INPUT_LERP
      inp.y += (target.y - inp.y) * GAME.INPUT_LERP
      inp.source = target.source

      // ----- gerak pesawat -----
      const px = THREE.MathUtils.clamp(inp.x, -1, 1) * GAME.X_LIMIT
      const py =
        GAME.Y_MIN + (THREE.MathUtils.clamp(inp.y, -1, 1) * 0.5 + 0.5) * (GAME.Y_MAX - GAME.Y_MIN)
      plane.group.position.x += (px - plane.group.position.x) * 0.12
      plane.group.position.y += (py - plane.group.position.y) * 0.12
      // banking + pitch dasar, plus akrobatik 360° saat input mendekati penuh
      const trick = trickRef.current
      const tx = Math.abs(inp.x) > GAME.TRICK_THRESHOLD ? Math.sign(inp.x) * Math.abs(inp.x) : 0
      const ty = Math.abs(inp.y) > GAME.TRICK_THRESHOLD ? Math.sign(inp.y) * Math.abs(inp.y) : 0
      if (phaseRef.current === 'playing') {
        if (tx !== 0) trick.roll += tx * GAME.TRICK_RATE * dt
        if (ty !== 0) trick.pitch += ty * GAME.TRICK_RATE * dt
      }
      if (tx === 0) trick.roll = easeToLevel(trick.roll, dt)
      if (ty === 0) trick.pitch = easeToLevel(trick.pitch, dt)
      plane.group.rotation.z = -inp.x * 0.6 + trick.roll // banking (+ roll 360°)
      plane.group.rotation.x = inp.y * 0.35 + trick.pitch // pitch hidung (+ loop 360°)
      plane.spinPropeller(dt)

      // kedip saat kebal
      plane.group.visible =
        invincibleRef.current > 0 ? Math.floor(invincibleRef.current * 10) % 2 === 0 : true

      // ----- dunia & entitas -----
      world.update(dt, speedRef.current)
      const events = entities.update(
        dt,
        phaseRef.current === 'playing' ? speedRef.current : 0,
        plane.group.position.x,
        plane.group.position.y,
        invincibleRef.current > 0,
        levelRef.current,
      )
      handleEvents(events)

      // ----- kamera chase -----
      camera.position.x += (plane.group.position.x * 0.55 - camera.position.x) * 0.08
      camera.position.y += (plane.group.position.y + 4.5 - camera.position.y) * 0.08
      camera.position.z = 14
      camera.lookAt(plane.group.position.x * 0.85, plane.group.position.y, PLANE_Z)
      camera.rotateZ(-inp.x * 0.3) // roll mengikuti banking

      renderer.render(scene, camera)

      // HUD label kecepatan & level (4x per detik saja)
      hudTimer += dt
      if (hudTimer > 0.25) {
        hudTimer = 0
        setSpeedLabel(Math.round(speedRef.current))
        const lv = levelRef.current
        if (lv !== lastLevel) {
          lastLevel = lv
          const bi = Math.min(Math.floor(lv / GAME.LEVELS_PER_BIOME), GAME.BIOMES.length - 1)
          const b = GAME.BIOMES[bi]
          setLevelLabel({ level: lv, name: b.name, emoji: b.emoji })
        }
      }
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', pMove)
      window.removeEventListener('pointerup', pUp)
      renderer.domElement.removeEventListener('pointerdown', pDown)
      world.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
    }
  }, [addPopup])

  // ---------- Aksi UI ----------
  const startGame = useCallback(() => {
    if (!audioRef.current) audioRef.current = new GameAudio()
    audioRef.current.unlock()
    scoreRef.current = 0
    livesRef.current = GAME.START_LIVES
    speedRef.current = GAME.SPEED_PRESETS[speedModeRef.current].start
    invincibleRef.current = 0
    inputRef.current = { x: 0, y: 0.25, source: inputRef.current.source }
    trickRef.current.roll = 0
    trickRef.current.pitch = 0
    distRef.current = 0
    levelRef.current = 0
    worldRef.current?.setBiome(0)
    setSaveState('idle')
    setScore(0)
    setCombo(0)
    setLives(GAME.START_LIVES)
    setPopups([])
    const p = planeRef.current
    if (p) {
      p.position.set(0, GAME.RING_START_Y, PLANE_Z)
      p.rotation.set(0, 0, 0)
    }
    entitiesRef.current?.reset()
    entitiesRef.current?.spawnInitial()
    setPhase('playing')
    phaseRef.current = 'playing'
  }, [])

  const toggleFlip = () => {
    setFlipY((v) => {
      localStorage.setItem(FLIP_KEY, v ? '0' : '1')
      return !v
    })
  }

  const toggleFlipX = () => {
    setFlipX((v) => {
      localStorage.setItem(FLIPX_KEY, v ? '0' : '1')
      return !v
    })
  }

  const chooseSpeed = (k: SpeedKey) => {
    setSpeedMode(k)
    localStorage.setItem(SPEED_KEY, k)
  }

  const startGyro = async () => {
    if (!gyroReaderRef.current) return
    await gyroReaderRef.current.start()
    const ok = gyroReaderRef.current.status.state === 'ok'
    gyroActiveRef.current = ok
    setGyroOn(ok)
  }

  const stopGyro = () => {
    gyroReaderRef.current?.stop()
    gyroActiveRef.current = false
    gyroInputRef.current.t = 0
    setGyroOn(false)
  }

  // ---------- Highscore ----------
  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/scores', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as Array<{ name: string; score: number; level: number }>
      setLeaderboard(data)
    } catch {
      /* server tidak tersedia — leaderboard disembunyikan saja */
    }
  }, [])

  useEffect(() => {
    void fetchLeaderboard()
  }, [fetchLeaderboard])

  const saveScore = useCallback(async () => {
    const name = playerName.trim().slice(0, 16)
    if (!name) return
    localStorage.setItem('tiltplane-name', name)
    setSaveState('saving')
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score: finalScore, level: levelLabel.level }),
      })
      if (!res.ok) throw new Error('gagal')
      const data = (await res.json()) as Array<{ name: string; score: number; level: number }>
      setLeaderboard(data)
      setSaveState('ok')
    } catch {
      setSaveState('fail')
    }
  }, [playerName, finalScore, levelLabel.level])

  const connectMb = async () => {
    try {
      await readerRef.current?.connect()
    } catch {
      /* status error sudah dikirim via onStatus */
    }
  }

  const disconnectMb = () => {
    void readerRef.current?.disconnect()
  }

  const statusChip = () => {
    if (gyroOn && gyroStatus.state === 'ok')
      return (
        <span className="rounded-full bg-black/45 px-3 py-1 text-sm text-white backdrop-blur">
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 align-middle" />
          🧭 Gyro HP aktif
        </span>
      )
    const s = mbStatus
    if (s.state === 'ok')
      return (
        <span className="rounded-full bg-black/45 px-3 py-1 text-sm text-white backdrop-blur">
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-400 align-middle" />
          micro:bit OK · {s.rate} data/dtk · x {s.x.toFixed(2)} · y {s.y.toFixed(2)}
        </span>
      )
    if (s.state === 'connected-nodata')
      return (
        <span className="rounded-full bg-black/45 px-3 py-1 text-sm text-orange-300 backdrop-blur">
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-orange-400 align-middle" />
          Tersambung, tapi belum ada data dari micro:bit
        </span>
      )
    if (s.state === 'error' || s.state === 'unsupported')
      return (
        <span className="max-w-xs rounded-full bg-black/45 px-3 py-1 text-sm text-red-300 backdrop-blur">
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-red-400 align-middle" />
          {s.message ?? 'Gagal tersambung'}
        </span>
      )
    return (
      <span className="rounded-full bg-black/45 px-3 py-1 text-sm text-white/90 backdrop-blur">
        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-red-500 align-middle" />
        micro:bit belum tersambung
      </span>
    )
  }

  const serialSupported = typeof navigator !== 'undefined' && 'serial' in navigator

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />

      {/* flash merah saat tabrakan */}
      {flash && <div className="pointer-events-none absolute inset-0 z-20 bg-red-600/40" />}

      {/* HUD */}
      {phase === 'playing' && (
        <>
          <div className="absolute left-4 top-4 z-10 text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]">
            <div className="text-4xl font-extrabold tabular-nums">{score}</div>
            {combo > 1 && (
              <div className="mt-1 inline-block rounded-lg bg-yellow-400/90 px-2 py-0.5 text-lg font-bold text-yellow-900">
                combo x{combo}
              </div>
            )}
          </div>
          <div className="absolute left-4 top-24 z-10 text-2xl drop-shadow">{'❤️'.repeat(lives)}</div>
          <div className="absolute bottom-3 left-4 z-10 rounded bg-black/35 px-2 py-0.5 text-sm text-white">
            kecepatan {speedLabel} · Level {levelLabel.level}/100 {levelLabel.emoji} {levelLabel.name}
          </div>
          {/* tombol gas & rem (HP) */}
          <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-20 flex items-end justify-between px-4">
            {!gyroOn && (
              <button
                onPointerDown={(e) => {
                  e.preventDefault()
                  touchBrakeRef.current = true
                }}
                onPointerUp={() => (touchBrakeRef.current = false)}
                onPointerLeave={() => (touchBrakeRef.current = false)}
                onPointerCancel={() => (touchBrakeRef.current = false)}
                className="pointer-events-auto h-20 w-20 touch-none select-none rounded-full bg-red-500/80 text-sm font-black text-white shadow-lg active:bg-red-600"
              >
                🛑 Rem
              </button>
            )}
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                touchGasRef.current = true
              }}
              onPointerUp={() => (touchGasRef.current = false)}
              onPointerLeave={() => (touchGasRef.current = false)}
              onPointerCancel={() => (touchGasRef.current = false)}
              className="pointer-events-auto ml-auto h-20 w-20 touch-none select-none rounded-full bg-green-500/80 text-sm font-black text-white shadow-lg active:bg-green-600"
            >
              ⛽ Gas
            </button>
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex flex-col items-center gap-1">
            {popups.map((p) => (
              <div key={p.id} className="animate-bounce text-4xl font-black text-yellow-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                {p.text}
              </div>
            ))}
          </div>
          <div className="absolute right-4 top-4 z-10">{statusChip()}</div>
        </>
      )}

      {/* MENU */}
      {phase === 'menu' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-gradient-to-b from-sky-400/60 to-blue-900/70 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white/95 p-6 shadow-2xl">
            <h1 className="text-center text-4xl font-black text-sky-700">✈️ Tilt Plane</h1>
            <p className="mt-1 text-center text-sm text-slate-600">
              Kumpulkan koin emas, hindari ranjau &amp; burung! Bisa dikendalikan dengan micro:bit, gyro HP, atau sentuhan.
            </p>
            <div className="mt-4">
              <div className="text-center text-sm font-bold text-slate-700">Kecepatan game</div>
              <div className="mt-2 flex justify-center gap-2">
                {SPEED_ORDER.map((k) => (
                  <button
                    key={k}
                    onClick={() => chooseSpeed(k)}
                    className={
                      speedMode === k
                        ? 'rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white shadow active:scale-95'
                        : 'rounded-xl bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-300 active:scale-95'
                    }
                  >
                    {GAME.SPEED_PRESETS[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-center">
              <button
                onClick={startGame}
                className="rounded-2xl bg-sky-600 px-10 py-3 text-xl font-bold text-white shadow-lg transition hover:bg-sky-700 active:scale-95"
              >
                ▶ Mulai Main
              </button>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-100 p-4">
              <div className="text-sm font-bold text-slate-700">🔌 Kendalikan dengan micro:bit (USB)</div>
              {serialSupported ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {mbStatus.state === 'disconnected' || mbStatus.state === 'error' || mbStatus.state === 'unsupported' ? (
                    <button
                      onClick={connectMb}
                      className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-700 active:scale-95"
                    >
                      Hubungkan micro:bit (USB)
                    </button>
                  ) : (
                    <button
                      onClick={disconnectMb}
                      className="rounded-xl bg-slate-500 px-4 py-2 text-sm font-bold text-white hover:bg-slate-600 active:scale-95"
                    >
                      Putuskan koneksi
                    </button>
                  )}
                  <label className="flex items-center gap-1 text-sm text-slate-700">
                    <input type="checkbox" checked={flipY} onChange={toggleFlip} className="h-4 w-4" />
                    Balik arah naik/turun
                  </label>
                  <label className="flex items-center gap-1 text-sm text-slate-700">
                    <input type="checkbox" checked={flipX} onChange={toggleFlipX} className="h-4 w-4" />
                    Balik arah kiri/kanan
                  </label>
                </div>
              ) : (
                <p className="mt-2 text-sm text-red-600">Pakai Chrome atau Edge di laptop/PC untuk micro:bit. Di HP main pakai sentuhan.</p>
              )}
              {(mbStatus.state === 'connected-nodata' || mbStatus.state === 'error' || mbStatus.state === 'unsupported') && (
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {mbStatus.state === 'connected-nodata'
                    ? 'Cek: (1) kode sudah di-flash ke micro:bit, (2) tutup tab editor MakeCode/Python, (3) cabut-colok ulang USB, (4) pilih port bernama mbed / micro:bit.'
                    : mbStatus.message}
                </p>
              )}
            </div>

            <div className="mt-3 rounded-2xl bg-slate-100 p-4">
              <div className="text-sm font-bold text-slate-700">🧭 Kendalikan dengan Gyro (HP)</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {gyroOn ? (
                  <button
                    onClick={stopGyro}
                    className="rounded-xl bg-slate-500 px-4 py-2 text-sm font-bold text-white hover:bg-slate-600 active:scale-95"
                  >
                    Matikan Gyro
                  </button>
                ) : (
                  <button
                    onClick={() => void startGyro()}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 active:scale-95"
                  >
                    Aktifkan Gyro
                  </button>
                )}
                {gyroOn && gyroStatus.state === 'ok' && (
                  <span className="text-sm text-emerald-700">
                    Gyro aktif — miringkan HP kanan-kiri &amp; atas-bawah
                  </span>
                )}
              </div>
              {gyroStatus.message && gyroStatus.state !== 'ok' && (
                <p className="mt-2 text-xs text-slate-600">{gyroStatus.message}</p>
              )}
            </div>

            <p className="mt-4 text-center text-xs text-slate-500">
              Tanpa micro:bit: panah/WASD di laptop (F=gas, V=rem), atau di HP: geser layar / aktifkan gyro + tombol Gas.
            </p>

            {leaderboard.length > 0 && (
              <div className="mt-3 rounded-2xl bg-yellow-50 p-4">
                <div className="text-sm font-bold text-yellow-800">🏆 Papan Skor Tinggi</div>
                <ol className="mt-2 space-y-0.5 text-sm text-slate-700">
                  {leaderboard.slice(0, 5).map((row, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">
                        {i + 1}. {row.name} <span className="text-xs text-slate-400">Lv{row.level}</span>
                      </span>
                      <span className="font-bold tabular-nums">{row.score}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GAME OVER */}
      {phase === 'gameover' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white/95 p-6 text-center shadow-2xl">
            <h2 className="text-3xl font-black text-red-600">💥 Game Over</h2>
            <p className="mt-2 text-lg text-slate-700">
              Skor kamu: <span className="text-2xl font-extrabold text-sky-700">{finalScore}</span>
              <span className="ml-2 text-sm text-slate-500">Level {levelLabel.level} {levelLabel.emoji}</span>
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.slice(0, 16))}
                placeholder="Nama kamu"
                maxLength={16}
                className="w-40 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
              <button
                onClick={() => void saveScore()}
                disabled={saveState === 'saving' || saveState === 'ok' || playerName.trim().length === 0}
                className="rounded-xl bg-yellow-500 px-4 py-2 text-sm font-bold text-white hover:bg-yellow-600 active:scale-95 disabled:opacity-50"
              >
                {saveState === 'saving' ? 'Menyimpan…' : saveState === 'ok' ? '✓ Tersimpan' : '🏆 Simpan Skor'}
              </button>
            </div>
            {saveState === 'fail' && (
              <p className="mt-2 text-xs text-red-600">Gagal menyimpan — coba lagi.</p>
            )}
            {leaderboard.length > 0 && (
              <ol className="mx-auto mt-3 max-w-xs space-y-0.5 text-left text-sm text-slate-700">
                {leaderboard.slice(0, 5).map((row, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">
                      {i + 1}. {row.name} <span className="text-xs text-slate-400">Lv{row.level}</span>
                    </span>
                    <span className="font-bold tabular-nums">{row.score}</span>
                  </li>
                ))}
              </ol>
            )}
            <button
              onClick={startGame}
              className="mt-4 rounded-2xl bg-sky-600 px-8 py-3 text-lg font-bold text-white shadow-lg hover:bg-sky-700 active:scale-95"
            >
              🔁 Main Lagi
            </button>
            <div className="mt-3">{statusChip()}</div>
          </div>
        </div>
      )}
    </div>
  )
}
