# Tilt Plane ✈️

Game terbang 3D low-poly di browser — lewati cincin emas, hindari ranjau berduri.
**Live:** [game.ainulhakim.com/pesawat](https://game.ainulhakim.com/pesawat/)

Dibangun dengan **Vite + React + TypeScript + three.js + Tailwind**.
Kendalikan dengan **BBC micro:bit via USB (Web Serial)**, keyboard (panah/WASD), atau sentuhan layar.

## Fitur

- Dunia 3D low-poly: laut bergelombang, pulau + palem (recycle), awan, kabut
- Pesawat: badan oranye, sayap kuning, propeller berputar, kokpit biru
- Cincin emas combo s.d. ×5 + popup skor
- Ranjau berduri, 3 nyawa, invincibility 1,6 dtk + kedip
- 4 ring awal membentuk garis lurus, suara Web Audio
- UI Bahasa Indonesia
- **3 preset kecepatan** (🐢 Lambat untuk anak-anak / ✈️ Normal / 🚀 Cepat)
- **Akrobatik 360°** — miringkan penuh untuk roll/loop penuh
- **Kendali gyro HP** (DeviceOrientation, izin iOS otomatis diminta)

## Kendali

| Perangkat | Cara |
|---|---|
| micro:bit (USB) | Web Serial 115200 baud, tilt kiri/kanan & atas/bawah |
| Gyro HP | Tombol "Aktifkan Gyro", miringkan HP (kanan-kiri, atas-bawah) |
| Laptop | Panah / WASD |
| HP (tanpa gyro) | Geser layar |

Checkbox *Balik arah naik/turun* & *Balik arah kiri/kanan* tersedia kalau orientasi
perangkat terasa terbalik (tersimpan di localStorage).

## Kendali micro:bit (USB)

Game membaca tilt via **Web Serial API** (Chrome/Edge desktop) pada 115200 baud.
Parser menerima dua format baris:

- `412,-230` (pasangan x,y — direkomendasikan)
- `x:412` / `y:-230` (gaya MakeCode, satu baris per sumbu)

### Program micro:bit (MakeCode)

Buat project baru di [makecode.microbit.org](https://makecode.microbit.org), pilih tampilan **JavaScript**, paste:

```javascript
basic.forever(function () {
    serial.writeLine("" + input.acceleration(Dimension.X) + "," + input.acceleration(Dimension.Y) + "," + (input.buttonIsPressed(Button.A) ? 1 : 0) + "," + (input.buttonIsPressed(Button.B) ? 1 : 0))
    basic.pause(40)
})
```

Format baris: `x,y,a,b` — **A = rem**, **B = gas**. Program lama 2 field (`x,y`) tetap didukung.

Download `.hex` lalu **drag ke drive MICROBIT** di komputer. Setelah LED selesai berkedip, klik
**Hubungkan micro:bit (USB)** di game dan pilih port *mbed / micro:bit*.

Tanpa micro:bit: panah/WASD di laptop (**F = gas, V = rem**), atau di HP: geser layar +
tombol **Gas** (kanan) / **Rem** (kiri), atau aktifkan **gyro** + tombol Gas.

## Menjalankan lokal

```bash
npm install
npm run dev      # dev server
npm run build    # output ke dist/
```

## Deployment

Game di-host di server rumah (port 8095, systemd unit `tilt-plane`, static http.server)
dan diekspos lewat Cloudflare Tunnel → `game.ainulhakim.com`.
Detail langkah lengkap: [`deploy/README-DEPLOY.md`](deploy/README-DEPLOY.md).

Update build berikutnya cukup:

```bash
npm run build
scp -r dist/* user@server:~/games/pesawat/   # tanpa restart apapun
```

## Struktur

```
src/
  game/     # dunia 3D, pesawat, rintangan, audio
  input/    # micro:bit Web Serial, parser, keyboard/touch
deploy/     # paket deployment (landing, systemd unit, panduan)
```
