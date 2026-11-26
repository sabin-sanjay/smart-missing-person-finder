// compressImage.js
// Phone cameras make photos of 3-8 MB. That's slow to upload on weak internet.
// This shrinks a photo to at most 800 pixels wide/tall and saves it as a JPEG,
// which usually makes it around 80-150 KB, while keeping faces clear enough
// for the face-matching AI.

export async function compressImage(file, maxSize = 800, quality = 0.75) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a photo (JPG or PNG).')
  }

  // Load the photo. imageOrientation "from-image" keeps phone photos the right way up.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

  // Work out the new size, keeping the same shape (never enlarging)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  // Draw it smaller on an invisible canvas
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  // Turn the canvas back into a JPEG file
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('Could not process this photo. Try another one.')
  return blob
}
