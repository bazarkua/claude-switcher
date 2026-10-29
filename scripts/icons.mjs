import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const tile = Buffer.from(
  '<svg width="1024" height="1024"><defs><linearGradient id="g" x2=".8" y2="1"><stop stop-color="#faf9f6"/><stop offset="1" stop-color="#eeeae4"/></linearGradient></defs><rect x="12" y="12" width="1000" height="1000" rx="224" fill="url(#g)" stroke="#ffffff" stroke-width="14"/></svg>',
)
const mark = await sharp('resources/logo-v2.png')
  .resize(820, 820, { fit: 'inside' })
  .png()
  .toBuffer()
await sharp(tile)
  .composite([{ input: mark, gravity: 'center' }])
  .png()
  .toFile('resources/icon.png')
const tray = Buffer.from(
  '<svg width="44" height="44" viewBox="0 0 44 44"><g fill="none" stroke="#000" stroke-width="4.5" stroke-linecap="round"><path d="M30 10H18c-12 0-12 14-1 14h10c11 0 11 14-1 14H14" transform="translate(0 -2)"/><path d="m26 6 5 4-5 4M18 30l-5 4 5 4" transform="translate(0 -2)"/></g></svg>',
)
await sharp(tray).png().toFile('resources/trayTemplate@2x.png')
await sharp(tray).resize(22).png().toFile('resources/trayTemplate.png')
await sharp('resources/icon.png').resize(32).png().toFile('resources/tray.png')
const png = await sharp('resources/icon.png').resize(256).png().toBuffer()
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(png.length, 14)
header.writeUInt32LE(22, 18)
await writeFile('resources/icon.ico', Buffer.concat([header, png]))
if (process.platform === 'darwin') {
  const dir = 'resources/icon.iconset'
  await mkdir(dir, { recursive: true })
  for (const size of [16, 32, 128, 256, 512]) {
    await sharp('resources/icon.png').resize(size).toFile(`${dir}/icon_${size}x${size}.png`)
    await sharp('resources/icon.png')
      .resize(size * 2)
      .toFile(`${dir}/icon_${size}x${size}@2x.png`)
  }
  execFileSync('iconutil', ['-c', 'icns', dir, '-o', 'resources/icon.icns'])
}
