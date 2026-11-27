// offlineQueue.js: sighting reports made WITHOUT internet are kept on the
// phone (in the browser's own small database, IndexedDB, photo included) and
// sent automatically as soon as the internet comes back.
//
//   queueSighting(report)  save one report on the phone
//   flushQueue()           try to send everything that's waiting
//   pendingCount()         how many are waiting
//   onQueueChange(fn)      get told when that number changes

import { supabase } from './supabase'

const DB_NAME = 'lumen'
const STORE = 'pending-sightings'
const EVENT = 'lumen-queue-change'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const result = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(result?.result ?? result)
    tx.onerror = () => reject(tx.error)
  })
}

const announce = () => window.dispatchEvent(new Event(EVENT))

/** True when an error was caused by having no internet (not by bad data). */
export function isNetworkError(err) {
  const msg = String(err?.message ?? err ?? '')
  return !navigator.onLine || /failed to fetch|networkerror|network request failed|load failed/i.test(msg)
}

/** Save a report on the phone. report = { userId, case_id, seen_at, lat, lng, notes, photo (Blob|null) } */
export async function queueSighting(report) {
  await withStore('readwrite', (s) => s.add({ ...report, queuedAt: Date.now() }))
  announce()
}

export async function pendingCount() {
  try {
    return await withStore('readonly', (s) => s.count())
  } catch {
    return 0
  }
}

export function onQueueChange(fn) {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}

let flushing = false

/** Send every waiting report. Stops quietly if the internet is still off. */
export async function flushQueue() {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    const items = await withStore('readonly', (s) => s.getAll())
    for (const item of items) {
      let photoPath = null
      if (item.photo) {
        photoPath = `${item.userId}/${crypto.randomUUID?.() ?? Date.now()}.jpg`
        const up = await supabase.storage.from('sighting-photos').upload(photoPath, item.photo, { contentType: 'image/jpeg' })
        if (up.error) {
          if (isNetworkError(up.error)) break // still offline: try again later
          photoPath = null                     // photo refused: send the report without it
        }
      }
      const { error } = await supabase.from('sightings').insert({
        case_id: item.case_id, seen_at: item.seen_at, lat: item.lat, lng: item.lng,
        notes: item.notes, photo_path: photoPath,
      })
      if (error && isNetworkError(error)) break
      // sent (or refused for good, e.g. the case is closed): remove it from the phone
      await withStore('readwrite', (s) => s.delete(item.id))
      announce()
    }
  } finally {
    flushing = false
  }
}
