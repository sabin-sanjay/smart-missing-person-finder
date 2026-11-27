// casePoster.js: draws a "MISSING" poster for one case, as a JPEG picture,
// in the Lumen style (red panels, ruby chip, photo, details, QR code).
// The QR code opens the case page, where people can report a sighting.
//
// Everything is drawn on the phone (an invisible <canvas>). Nothing is uploaded.
// This file is only downloaded when someone taps "Share poster".

import { encode } from 'uqr'
import { casePhotoUrl } from './supabase'

const W = 1080
const H = 1350
const PAPER = '#f9eceb'
const INK = '#3a0b12'
const MUTED = '#7b5f64'
const OLIVE = '#9c1d2a'
const SKY = '#ffd6d2'
const ORANGE = '#dc3441'
const SANS = '"Outfit Variable", system-ui, "Noto Sans Devanagari", sans-serif'
const MONO = '"Geist Mono Variable", ui-monospace, monospace'

// Rounded rectangle path
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// A red "liquid crystal" panel: crimson + pink glow + soft top sheen
function olivePanel(ctx, x, y, w, h, r) {
  ctx.save()
  rounded(ctx, x, y, w, h, r)
  ctx.clip()
  ctx.fillStyle = OLIVE
  ctx.fillRect(x, y, w, h)
  const glow = ctx.createRadialGradient(x + w * 0.85, y + h * 0.6, 0, x + w * 0.85, y + h * 0.6, w * 0.45)
  glow.addColorStop(0, 'rgba(255,160,155,0.55)')
  glow.addColorStop(1, 'rgba(255,160,155,0)')
  ctx.fillStyle = glow
  ctx.fillRect(x, y, w, h)
  const sheen = ctx.createLinearGradient(0, y, 0, y + h * 0.5)
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(x, y, w, h * 0.5)
  ctx.restore()
}

// Write text that wraps onto at most `maxLines` lines (adds "…" if it's cut)
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).split(/\s+/)
  let line = ''
  let lines = 0
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]
    if (ctx.measureText(test).width > maxWidth && line) {
      if (lines === maxLines - 1) {
        ctx.fillText(line.replace(/.{0,2}$/, '…'), x, y)
        return y + lineHeight
      }
      ctx.fillText(line, x, y)
      line = words[i]
      y += lineHeight
      lines++
    } else {
      line = test
    }
  }
  if (line) { ctx.fillText(line, x, y); y += lineHeight }
  return y
}

// Load the case photo as something the canvas can draw.
// "?poster=1" skips the offline photo copy (that copy can't be drawn on a canvas).
async function loadPhoto(photoPath) {
  if (!photoPath) return null
  try {
    const res = await fetch(casePhotoUrl(photoPath) + '?poster=1', { mode: 'cors' })
    if (!res.ok) return null
    return await createImageBitmap(await res.blob())
  } catch {
    return null
  }
}

/**
 * Make the poster.
 * @param c     the case (full_name, age, gender, height_cm, description, photo_path, last_seen_*)
 * @param words translated words: { missing, helpFind, lastSeen, seen, scan, emergency, gender }
 * @param url   the case page address (goes into the QR code)
 * @returns a JPEG Blob
 */
export async function makePoster(c, words, url) {
  // Make sure the fonts are ready before drawing text with them
  await Promise.all([
    document.fonts.load(`400 40px ${SANS}`), document.fonts.load(`600 40px ${SANS}`),
    document.fonts.load(`500 30px ${MONO}`),
  ]).catch(() => {})

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, H)

  // ---- Top olive panel: MISSING chip, "Please help find", Lumen ----
  olivePanel(ctx, 40, 40, W - 80, 230, 56)
  ctx.font = `700 30px ${MONO}`
  const chip = words.missing.toUpperCase()
  const chipW = ctx.measureText(chip).width + 48
  const chipGrad = ctx.createLinearGradient(0, 84, 0, 140)
  chipGrad.addColorStop(0, '#f2646c'); chipGrad.addColorStop(1, '#b41f2e')
  ctx.fillStyle = chipGrad
  rounded(ctx, 88, 84, chipW, 56, 16); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.fillText(chip, 112, 113)
  ctx.font = `400 34px ${SANS}`
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.textAlign = 'right'
  ctx.fillText('Lumen', W - 88, 113)
  ctx.textAlign = 'left'
  ctx.font = `400 64px ${SANS}`
  ctx.fillStyle = SKY
  ctx.fillText(words.helpFind, 88, 210)

  // ---- Photo (fills its box, cropped from the middle) ----
  const px = 40, py = 300, pw = W - 80, ph = 500
  ctx.save()
  rounded(ctx, px, py, pw, ph, 56); ctx.clip()
  ctx.fillStyle = '#e4e2da'
  ctx.fillRect(px, py, pw, ph)
  const photo = await loadPhoto(c.photo_path)
  if (photo) {
    const scale = Math.max(pw / photo.width, ph / photo.height)
    const dw = photo.width * scale, dh = photo.height * scale
    ctx.drawImage(photo, px + (pw - dw) / 2, py + (ph - dh) / 2.6, dw, dh)
  } else {
    ctx.fillStyle = '#b9b6ab'
    ctx.beginPath(); ctx.arc(W / 2, py + 230, 90, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(W / 2, py + 470, 190, 130, 0, Math.PI, 0); ctx.fill()
  }
  ctx.restore()

  // ---- Name and details ----
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = INK
  ctx.font = `600 78px ${SANS}`
  ctx.fillText(c.full_name, 56, 890)
  ctx.font = `500 32px ${MONO}`
  ctx.fillStyle = MUTED
  const facts = [c.age != null && `${c.age} yrs`, words.gender, c.height_cm && `${c.height_cm} cm`].filter(Boolean).join(' · ')
  ctx.fillText(facts, 58, 938)

  ctx.font = `400 34px ${SANS}`
  ctx.fillStyle = INK
  const seenAt = new Date(c.last_seen_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  const by = H - 40 - 210 // top of the bottom panel
  let y = wrapText(ctx, `${words.lastSeen}: ${c.last_seen_address ? c.last_seen_address + ', ' : ''}${seenAt}`, 56, 990, W - 112, 44, 2)
  // Description: as many lines as fit above the bottom panel (max 2)
  const room = Math.floor((by - 24 - (y + 2)) / 40) + 1
  if (c.description && room > 0) {
    ctx.font = `400 30px ${SANS}`
    ctx.fillStyle = MUTED
    wrapText(ctx, c.description, 56, y + 2, W - 112, 40, Math.min(2, room))
  }

  // ---- Bottom olive panel: QR code + how to report ----
  olivePanel(ctx, 40, by, W - 80, 210, 56)
  const qr = encode(url, { ecc: 'M', border: 2 })
  const box = 170, cell = box / qr.size
  ctx.fillStyle = '#fff'
  rounded(ctx, 72, by + 20, box, box, 20); ctx.fill()
  ctx.fillStyle = INK
  qr.data.forEach((row, r) => row.forEach((on, col) => {
    if (on) ctx.fillRect(72 + col * cell, by + 20 + r * cell, Math.ceil(cell), Math.ceil(cell))
  }))
  ctx.fillStyle = SKY
  ctx.font = `400 46px ${SANS}`
  ctx.fillText(words.seen, 280, by + 78)
  ctx.fillStyle = '#fff'
  ctx.font = `400 30px ${SANS}`
  ctx.fillText(words.scan, 280, by + 124)
  ctx.fillStyle = '#ffc2bd'
  ctx.font = `600 28px ${MONO}`
  ctx.fillText(words.emergency.toUpperCase(), 280, by + 172)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
}
