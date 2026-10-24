const API = import.meta.env.VITE_API_URL as string

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error('Login failed')
  return (await res.json()).token
}

export function uploadImage(
  file: File,
  authToken: string,
  onProgress: (percent: number) => void
): Promise<{ secure_url: string; public_id: string }> {
  return new Promise(async (resolve, reject) => {
    try {
      // Step 1: ask YOUR backend for permission
      const signRes = await fetch(`${API}/api/upload/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ mimeType: file.type, size: file.size }),
      })
      if (!signRes.ok) {
        const err = await signRes.json().catch(() => ({}))
        throw new Error(err.error ?? 'Backend refused the upload')
      }
      const s = await signRes.json()

      // Step 2: send the file straight to Cloudinary (never touches your server)
      const form = new FormData()
      form.append('file', file)
      form.append('api_key', s.apiKey)
      form.append('timestamp', String(s.timestamp))
      form.append('signature', s.signature)
      form.append('folder', s.folder)
      form.append('public_id', s.public_id)
      form.append('upload_preset', s.upload_preset)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${s.cloudName}/image/upload`)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve(JSON.parse(xhr.responseText))
          : reject(new Error(JSON.parse(xhr.responseText)?.error?.message ?? 'Upload failed'))
      xhr.onerror = () => reject(new Error('Network error'))
      xhr.send(form)
    } catch (e) {
      reject(e)
    }
  })
}