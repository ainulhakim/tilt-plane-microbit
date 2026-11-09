# Firmware micro:bit Tilt Plane

Firmware yang di-inject tombol "⚡ Inject Firmware ke micro:bit" (WebUSB/DAPjs).

- Protocol v2.0: kirim baris `x,y,a,b` tiap ~40ms (25Hz). A = rem, B = gas (held=1).
- Format **universal hex**: jalan di micro:bit **V1 (9900) & V2 (9903)**.
- File: `public/firmware/tilt-plane.hex` (hasil build `binary.hex` dari pxt).

## Rebuild firmware

Sumber: `main.ts` + `pxt.json` di folder ini (MakeCode/pxt, target microbit v9).

```bash
# sekali: clone target + install (SKIP puppeteer download!)
git clone --depth 1 https://github.com/microsoft/pxt-microbit.git
cd pxt-microbit
PUPPETEER_SKIP_DOWNLOAD=true npm install
node node_modules/pxt-core/built/pxt.js buildtarget   # unduh hexcache runtime V1+V2

# build project
mkdir libs/tiltplane   # copy main.ts + pxt.json dari firmware-src/
cd libs/tiltplane
node ../../node_modules/pxt-core/built/pxt.js install
node ../../node_modules/pxt-core/built/pxt.js build
cp built/binary.hex ~/tilt-plane/public/firmware/tilt-plane.hex
```

## Fallback jalur MicroPython (kalau pxt tidak tersedia)

Script `/tmp/build_tiltplane_hex.py` di VM Hermes (pakai uflash master yang membawa
runtime universal) menghasilkan universal hex MicroPython dengan script `main.py`
setara. Catatan: jalur MakeCode lebih proven untuk streaming serial (sesi 2026-11-01).

## Catatan teknis inject

- WebUSB: VID 0x0d28 / PID 0x0204, vendor interface class 0xFF, `dapjs` (DAPLink vendor flash).
- dapjs di dynamic-import (`src/input/microbitFlash.ts`) supaya bundle utama tetap ringan.
- Progress event: `DAPLink.EVENT_PROGRESS` memberi fraksi 0..1.
