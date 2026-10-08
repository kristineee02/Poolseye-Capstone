const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const cloudinary = require('cloudinary').v2

const MEDIA_DIR = path.join(__dirname, 'media')
const MEDIA_ROUTE = '/media'
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'poolseye/events'

let cloudinaryReady = null

// Render's disk is wiped on every deploy/restart, so hosted media must live in Cloudinary.
function useCloudinary() {
  if (cloudinaryReady !== null) return cloudinaryReady
  const raw = String(process.env.CLOUDINARY_URL || '').trim()
  cloudinaryReady = false
  if (!raw) return false
  try {
    const url = new URL(raw)
    const apiKey = decodeURIComponent(url.username)
    const apiSecret = decodeURIComponent(url.password)
    const cloudName = url.hostname
    if (url.protocol !== 'cloudinary:' || !apiKey || !apiSecret || !cloudName || /[<>]/.test(raw)) {
      throw new Error('expected cloudinary://<api_key>:<api_secret>@<cloud_name>')
    }
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
    cloudinaryReady = true
    console.log(`[media] storing event snapshots and clips in Cloudinary (${cloudName}/${CLOUDINARY_FOLDER})`)
  } catch (err) {
    console.warn(`[media] CLOUDINARY_URL is invalid (${err.message}); saving media to ${MEDIA_DIR} instead`)
  }
  return cloudinaryReady
}

function uploadToCloudinary(buffer, resourceType) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: CLOUDINARY_FOLDER, resource_type: resourceType, public_id: crypto.randomUUID() },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    )
    stream.end(buffer)
  })
}

/** Store a snapshot or clip and return the URI saved on the event. */
async function saveMedia(buffer, { ext, resourceType }) {
  if (useCloudinary()) return uploadToCloudinary(buffer, resourceType)
  await fs.promises.mkdir(MEDIA_DIR, { recursive: true })
  const name = `${crypto.randomUUID()}.${ext}`
  await fs.promises.writeFile(path.join(MEDIA_DIR, name), buffer)
  return `${MEDIA_ROUTE}/${name}`
}

function cloudinaryAsset(uri) {
  const match = /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i.exec(uri)
  return match ? { resourceType: match[1], publicId: match[2] } : null
}

/** Best-effort removal of media an event no longer points to. */
async function removeMedia(uri) {
  if (!uri) return
  if (uri.startsWith(`${MEDIA_ROUTE}/`)) {
    await fs.promises.unlink(path.join(MEDIA_DIR, path.basename(uri))).catch(() => {})
    return
  }
  const asset = cloudinaryAsset(uri)
  if (asset && useCloudinary()) {
    await cloudinary.uploader
      .destroy(asset.publicId, { resource_type: asset.resourceType })
      .catch((err) => console.warn('[media] could not delete old Cloudinary asset:', err.message))
  }
}

module.exports = { MEDIA_DIR, MEDIA_ROUTE, saveMedia, removeMedia, useCloudinary }
