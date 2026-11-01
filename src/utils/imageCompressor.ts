/**
 * imageCompressor.ts
 * Client-side camera and gallery image compressor.
 * Resizes images to max dimension 1280px JPEG, compresses to ~300-600 kB,
 * and strips all EXIF metadata / GPS location tags via canvas redrawing.
 */

export interface CompressedImageResult {
  base64: string // Raw base64 data without data:image/jpeg;base64, prefix
  dataUrl: string // Full data URL for immediate local preview
  width: number
  height: number
  sizeBytes: number
}

const MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.75

export async function compressStudyPhoto(file: File | Blob): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    // Basic format guard
    if (file.type && !file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image.'))
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to load image for compression.'))
      img.onload = () => {
        let { width, height } = img

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width)
            width = MAX_DIMENSION
          } else {
            width = Math.round((width * MAX_DIMENSION) / height)
            height = MAX_DIMENSION
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          return reject(new Error('Canvas 2D context not available.'))
        }

        // Fill white background in case of PNG transparency before JPEG conversion
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)

        // Draw image (stripping all original EXIF / location metadata)
        ctx.drawImage(img, 0, 0, width, height)

        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
        const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '')
        const sizeBytes = Math.round((base64.length * 3) / 4)

        resolve({
          base64,
          dataUrl,
          width,
          height,
          sizeBytes,
        })
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export const compressImage = compressStudyPhoto

