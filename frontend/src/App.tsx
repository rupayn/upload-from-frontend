import { useState } from 'react'
import { login, uploadImage } from './utils/upload'

export default function App() {
  const [token, setToken] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleLogin() {
    try {
      setToken(await login('demo', 'demo123'))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !token) return
    setBusy(true)
    setError(null)
    setUrl(null)
    setProgress(0)
    try {
      const result = await uploadImage(file, token, setProgress)
      setUrl(result.secure_url)
      // Send result.public_id to your backend here if you want to save it in your DB
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: '48px auto', fontFamily: 'system-ui' }}>
      <h1>Secure Cloudinary upload</h1>

      {!token ? (
        <button onClick={handleLogin}>Log in as demo user</button>
      ) : (
        <>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} disabled={busy} />
          {busy && <p>Uploading… {progress}%</p>}
        </>
      )}

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {url && (
        <>
          <p>Uploaded:</p>
          <img src={url} alt="Uploaded" style={{ maxWidth: '100%' }} />
        </>
      )}
    </main>
  )
}