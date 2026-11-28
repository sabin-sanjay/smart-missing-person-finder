// casePdf.js: makes a downloadable PDF report of one case, for police.
// Includes: photo, all details, who reported it, status history and
// every sighting (time, place, face-match score, review status).
// jsPDF is loaded only when someone presses "Download PDF".

import { supabase, casePhotoUrl } from './supabase'
import { googleMapsLink } from './geo'

// Downloads an image and turns it into a "data URL" that jsPDF can embed
async function imageToDataUrl(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('photo download failed')
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN') : '-')

// jsPDF's built-in fonts only support basic Latin letters, so other
// characters (emoji, Hindi, etc.) are replaced with "?" instead of breaking the PDF.
const safe = (text) => String(text ?? '-').replace(/[^\x20-\x7E\n]/g, '?')

export async function downloadCasePdf(c) {
  const { jsPDF } = await import('jspdf')

  // Get the sightings for this case (police can see all of them)
  const { data: sightings } = await supabase
    .from('sightings')
    .select('seen_at, lat, lng, notes, face_match_score, face_error, review_status, reporter:profiles!reported_by(full_name, phone)')
    .eq('case_id', c.id)
    .order('seen_at', { ascending: true })

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const left = 15
  const width = 180
  let y = 18

  // Starts a new page when we're near the bottom
  const ensureSpace = (needed) => {
    if (y + needed > 280) {
      doc.addPage()
      y = 18
    }
  }
  const heading = (text) => {
    ensureSpace(14)
    y += 4
    doc.setFont('helvetica', 'bold').setFontSize(13).text(text, left, y)
    doc.setLineWidth(0.3).line(left, y + 1.5, left + width, y + 1.5)
    y += 8
    doc.setFont('helvetica', 'normal').setFontSize(10)
  }
  const row = (label, value) => {
    const lines = doc.splitTextToSize(safe(value), width - 40)
    ensureSpace(lines.length * 5 + 1)
    doc.setFont('helvetica', 'bold').text(label, left, y)
    doc.setFont('helvetica', 'normal').text(lines, left + 40, y)
    y += lines.length * 5 + 1
  }

  // ---- Title ----
  doc.setFont('helvetica', 'bold').setFontSize(18).text('Missing Person Case Report', left, y)
  y += 6
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100)
    .text(`Lumen | Case ID: ${c.id} | Generated ${fmt(new Date())}`, left, y)
  doc.setTextColor(0)
  y += 8

  // ---- Photo (right side) + main details (left side) ----
  const top = y
  try {
    if (!c.photo_path) throw new Error('no photo') // the grey placeholder can't go in a PDF
    // "?pdf=1" skips the photo copy saved by the offline cache (that copy
    // can't be read by code, only displayed), so we get a fresh one.
    const img = await imageToDataUrl(casePhotoUrl(c.photo_path) + '?pdf=1')
    doc.addImage(img, 'JPEG', left + width - 50, top, 50, 60)
  } catch {
    doc.setFontSize(9).text('(photo unavailable)', left + width - 50, top + 30)
  }

  doc.setFontSize(10)
  const detailWidthRow = (label, value) => {
    const lines = doc.splitTextToSize(safe(value), 85)
    doc.setFont('helvetica', 'bold').text(label, left, y)
    doc.setFont('helvetica', 'normal').text(lines, left + 35, y)
    y += lines.length * 5 + 1
  }
  detailWidthRow('Name', c.full_name)
  detailWidthRow('Age', c.age ?? 'Not given')
  detailWidthRow('Gender', c.gender ?? 'Not given')
  detailWidthRow('Height', c.height_cm ? `${c.height_cm} cm` : 'Not given')
  detailWidthRow('Status', String(c.status).toUpperCase())
  detailWidthRow('Last seen', fmt(c.last_seen_at))
  detailWidthRow('Place', c.last_seen_address || 'See coordinates')
  detailWidthRow('Coordinates', `${c.last_seen_lat.toFixed(5)}, ${c.last_seen_lng.toFixed(5)}`)
  y = Math.max(y, top + 64)

  heading('Description')
  row('', c.description || 'None given')

  heading('Reported by')
  row('Name', c.reporter?.full_name || 'Not given')
  row('Phone', c.reporter?.phone || 'Not given')

  heading('Case history')
  row('Registered', fmt(c.created_at))
  row('Reviewed', fmt(c.verified_at))
  if (c.rejection_reason) row('Rejection', c.rejection_reason)
  row('Found', fmt(c.found_at))
  row('Alert radius', `${c.alert_radius_km} km`)

  heading(`Sightings (${sightings?.length ?? 0})`)
  if (!sightings?.length) row('', 'No sightings reported.')
  sightings?.forEach((s, i) => {
    ensureSpace(30)
    doc.setFont('helvetica', 'bold').text(`#${i + 1}  ${fmt(s.seen_at)}  [${s.review_status}]`, left, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    row('Location', `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}  ${googleMapsLink(s.lat, s.lng)}`)
    row('Face match', s.face_match_score != null ? `${Math.round(s.face_match_score * 100)}%` : s.face_error || 'No photo / not checked')
    row('Reporter', `${s.reporter?.full_name || '-'}  ${s.reporter?.phone || ''}`)
    if (s.notes) row('Notes', s.notes)
    y += 2
  })

  // ---- Newer sections: extra photos, search party, messages, activity log ----
  // (each one quietly shows "none" if that part has no data)
  const [photos, searches, volunteers, messages, activity] = await Promise.all([
    supabase.from('case_photos').select('photo_path, created_at').eq('case_id', c.id).order('created_at'),
    supabase.from('search_checks').select('lat, lng, created_at').eq('case_id', c.id).order('created_at'),
    supabase.rpc('search_volunteers', { p_case: c.id }),
    supabase.from('case_messages').select('from_police, body, created_at').eq('case_id', c.id).order('created_at'),
    supabase.from('case_activity').select('action, detail, created_at, actor:profiles(full_name, role)').eq('case_id', c.id).order('created_at'),
  ])

  const extra = photos.data ?? []
  heading(`Extra photos (${extra.length})`)
  if (!extra.length) row('', 'No extra photos.')
  let x = left
  for (const p of extra) {
    try {
      ensureSpace(42)
      const img = await imageToDataUrl(casePhotoUrl(p.photo_path) + '?pdf=1')
      doc.addImage(img, 'JPEG', x, y, 32, 38)
      x += 36
    } catch {
      // a photo that can't load is skipped
    }
  }
  if (extra.length) y += 42

  const areas = searches.data ?? []
  heading('Search party')
  row('Areas searched', `${areas.length}`)
  row('Volunteers (24 h)', `${volunteers.data ?? 0}`)
  if (areas.length) {
    row('First / last', `${fmt(areas[0].created_at)}  /  ${fmt(areas[areas.length - 1].created_at)}`)
  }

  const chat = messages.data ?? []
  heading(`Messages between police and family (${chat.length})`)
  if (!chat.length) row('', 'No messages.')
  chat.forEach((m) => row(`${m.from_police ? 'Police' : 'Family'}`, `${fmt(m.created_at)}  ${m.body}`))

  const log = activity.data ?? []
  heading(`Activity log (${log.length})`)
  if (!log.length) row('', 'No activity recorded.')
  log.forEach((a) => {
    const who = a.actor ? `${a.actor.full_name || 'Unnamed'} (${a.actor.role})` : 'System'
    row(fmt(a.created_at).slice(0, 17), `${a.action.replace(/_/g, ' ')}${a.detail ? ` - ${a.detail}` : ''}  |  ${who}`)
  })

  // Page numbers at the bottom of every page
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(8).setTextColor(120).text(`Page ${p} of ${pages}  |  CONFIDENTIAL: for police use only`, left, 292)
  }

  const safeName = c.full_name.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)
  doc.save(`case_${safeName}_${c.id.slice(0, 8)}.pdf`)
}
