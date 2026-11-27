// compressImage.js
// Phone cameras make photos of 3-8 MB. That's slow to upload on weak internet.
// This shrinks a photo to at most 800 pixels wide/tall and saves it as a JPEG,
// which usually makes it around 80-150 KB, while keeping faces clear enough
// for the face-matching AI.

export async function compressImage(file, maxSize = 800, quality = 0.75) {
  // (Some phones leave the type blank for HEIC photos, so blank is allowed too)
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Please choose a photo (JPG or PNG).')
  }

  const picture = await loadPicture(file)

  // Work out the new size, keeping the same shape (never enlarging)
  const scale = Math.min(1, maxSize / Math.max(picture.width, picture.height))
  const width = Math.round(picture.width * scale)
  const height = Math.round(picture.height * scale)

  // Draw it smaller on an invisible canvas
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(picture.source, 0, 0, width, height)
  picture.done()

  // Turn the canvas back into a JPEG file
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('Could not process this photo. Try another one.')
  return blob
}

// Open a photo file so it can be drawn. Tries the fast modern way first; if the
// phone doesn't support it (some iPhones, especially with HEIC photos), falls
// back to loading it like a normal <img>, which every browser can do.
// Both ways keep phone photos the right way up.
async function loadPicture(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) }
    } catch {
      URL.revokeObjectURL(url)
      throw new Error('Could not open this photo. Try taking a new one, or pick a different photo.')
    }
  }
}
