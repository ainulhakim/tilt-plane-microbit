// Smoke test visual: buka game, klik Mulai Main, tunggu, screenshot gameplay.
const { chromium } = require('playwright-core')

const EXE = '/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'

async function main() {
  const browser = await chromium.launch({
    executablePath: EXE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text())
  })

  await page.goto('http://127.0.0.1:4173/pesawat/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: '/tmp/tilt-menu.png' })

  // klik Mulai Main
  await page.getByText('Mulai Main').click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: '/tmp/tilt-play1.png' })

  await page.waitForTimeout(3000)
  await page.screenshot({ path: '/tmp/tilt-play2.png' })

  // cek HUD skor muncul
  const score = await page.locator('text=/^\\d+$/').first().textContent().catch(() => null)
  console.log('SCORE_TEXT:', score)
  console.log('JS_ERRORS:', errors.length ? errors.join(' | ') : 'tidak ada')
  await browser.close()
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
