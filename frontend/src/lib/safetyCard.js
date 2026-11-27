// safetyCard.js: the QR safety card for a child or an elderly person.
//
// PRIVATE BY DESIGN: the details (name, family phone, note) are NOT saved on
// any server. They are packed into the QR code's own link, after the "#":
//   https://lumen.../sos#eyJuIjoiQXJ1bi...
// Browsers never send the part after "#" to a server, so only the person
// who scans the card sees it.

import { encode } from 'uqr'

// text -> safe link text (works with Tamil, Hindi... letters too)
function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unpack(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** card = { name, age, guardian, phone, phone2, note } -> the link inside the QR code */
export function cardLink(card) {
  const short = { n: card.name, a: card.age, g: card.guardian, p: card.phone, q: card.phone2, m: card.note }
  Object.keys(short).forEach((k) => { if (!short[k]) delete short[k] })
  return `${window.location.origin}/sos#${pack(short)}`
}

/** The details from a scanned link's "#..." part, or null if it isn't a valid card */
export function readCard(hash) {
  try {
    const d = unpack(hash.replace(/^#/, ''))
    if (!d.n || !d.p) return null
    return { name: d.n, age: d.a, guardian: d.g, phone: d.p, phone2: d.q, note: d.m }
  } catch {
    return null
  }
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/**
 * Draw the card (ID-card shape, 1012 x 638) as a PNG picture to print or save.
 * words = translated texts { title, scan, call, emergency }
 */
export async function drawCard(card, words) {
  const W = 1012, H = 638
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const SANS = '"Figtree Variable", system-ui, "Noto Sans Tamil", "Noto Sans Devanagari", sans-serif'
  await document.fonts.load(`600 40px ${SANS}`).catch(() => {})

  // black card with a red glow
  rounded(ctx, 0, 0, W, H, 44)
  ctx.save()
  ctx.clip()
  ctx.fillStyle = '#121012'
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.75)
  glow.addColorStop(0, 'rgba(210,22,30,0.85)')
  glow.addColorStop(1, 'rgba(210,22,30,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  ctx.restore()

  // title strip
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 30px ${SANS}`
  ctx.fillText(words.title.toUpperCase(), 56, 84)
  ctx.font = `400 26px ${SANS}`
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText('Lumen', 56, 120)

  // name
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 64px ${SANS}`
  ctx.fillText(card.name + (card.age ? `, ${card.age}` : ''), 56, 230, 520)

  // family phone (readable even without scanning)
  ctx.font = `400 26px ${SANS}`
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText(words.call + (card.guardian ? ` (${card.guardian})` : ''), 56, 300, 520)
  ctx.font = `600 50px ${SANS}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(card.phone, 56, 360, 520)
  if (card.phone2) {
    ctx.font = `500 34px ${SANS}`
    ctx.fillText(card.phone2, 56, 410, 520)
  }

  // emergency line
  rounded(ctx, 56, 500, 300, 70, 35)
  const red = ctx.createLinearGradient(0, 500, 0, 570)
  red.addColorStop(0, '#f0262e')
  red.addColorStop(1, '#b30c14')
  ctx.fillStyle = red
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 30px ${SANS}`
  ctx.textAlign = 'center'
  ctx.fillText(words.emergency, 206, 546)
  ctx.textAlign = 'left'

  // QR code on a white tile
  const qr = encode(cardLink(card), { ecc: 'M', border: 2 })
  const box = 340, x = W - box - 56, y = 150
  ctx.fillStyle = '#ffffff'
  rounded(ctx, x - 14, y - 14, box + 28, box + 28, 28)
  ctx.fill()
  const cell = box / qr.size
  ctx.fillStyle = '#121012'
  qr.data.forEach((row, r) => row.forEach((on, c) => {
    if (on) ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell))
  }))
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `500 24px ${SANS}`
  ctx.textAlign = 'center'
  ctx.fillText(words.scan, x + box / 2, y + box + 60, box + 40)
  ctx.textAlign = 'left'

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
