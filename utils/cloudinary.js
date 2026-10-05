import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export const uploadBuffer = (
  buffer,
  folder,
  resourceType = 'auto'
) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      }
    )

    stream.end(buffer)
  })

export const deleteFile = async (
  publicId,
  resourceType = 'image'
) => {
  if (!publicId) return

  await cloudinary.uploader.destroy(
    publicId,
    {
      resource_type: resourceType,
    }
  )
}

export default cloudinary