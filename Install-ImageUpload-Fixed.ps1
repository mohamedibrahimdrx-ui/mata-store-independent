$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$frontend = Join-Path $root 'frontend'
$adminFile = Join-Path $frontend 'src\AdminApp.jsx'
$firebaseFile = Join-Path $frontend 'src\firebase.js'
$cssFile = Join-Path $frontend 'src\Admin.css'

foreach ($file in @($adminFile, $firebaseFile, $cssFile)) {
  if (!(Test-Path -LiteralPath $file)) { throw "Required file not found: $file. No changes made." }
}

$src = [System.IO.File]::ReadAllText($adminFile)
if ($src.Contains("from 'firebase/storage'")) {
  Write-Host 'Firebase Storage import already exists. No changes made to avoid duplicate edits.'
  exit 0
}

# Find required insertion points without depending on exact whitespace or line formatting.
$authPattern = "import\s*\{\s*onAuthStateChanged\s*,\s*signInWithEmailAndPassword\s*,\s*signOut\s*\}\s*from\s*'firebase/auth'"
$authMatch = [regex]::Match($src, $authPattern)
$cssImport = "import './Admin.css'"
$statePattern = "const\s*\[\s*error\s*,\s*setError\s*\]\s*=\s*useState\(''\)"
$stateMatch = [regex]::Match($src, $statePattern)
$imagePattern = '(?s)<label>\s*رابط الصورة\s*<input\s+type="url"\s+value=\{form\.image\}\s+onChange=\{e\s*=>\s*set\(''image'',\s*e\.target\.value\)\}\s+required\s*/>\s*</label>'
$imageMatch = [regex]::Match($src, $imagePattern)

if (!$authMatch.Success) { throw 'Could not find Firebase auth import. No changes made.' }
if (!$src.Contains($cssImport)) { throw 'Could not find Admin.css import. No changes made.' }
if (!$stateMatch.Success) { throw 'Could not find ProductEditor error state. No changes made.' }
if (!$imageMatch.Success) { throw 'Could not find the image URL field in AdminApp.jsx. No changes made.' }

# Prepare changes in memory first. Write only after all replacements succeeded.
$storageImport = "import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'"
$src = $src.Insert($authMatch.Index + $authMatch.Length, "`r`n$storageImport")
$src = $src.Replace($cssImport, "$cssImport`r`n`r`nconst storage = getStorage()")

# Re-find state after adding the import.
$stateMatch = [regex]::Match($src, $statePattern)
$handler = @'
  const [uploading, setUploading] = useState(false)
  async function handleImageFile(file) {
    if (!file) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('اختار صورة JPG أو PNG أو WebP فقط.'); return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('حجم الصورة لازم يكون 5 ميجابايت أو أقل.'); return
    }
    setUploading(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const objectRef = ref(storage, `product-images/${Date.now()}-${safeName}`)
      await uploadBytes(objectRef, file, { contentType: file.type })
      const url = await getDownloadURL(objectRef)
      set('image', url)
    } catch (err) {
      setError('فشل رفع الصورة. تأكد من تفعيل Firebase Storage والصلاحيات. ' + (err?.code || ''))
    } finally {
      setUploading(false)
    }
  }
'@
$src = $src.Insert($stateMatch.Index + $stateMatch.Length, "`r`n$handler")

$imageField = @'
<div className="ad-image-upload ad-wide">
  <label>صورة المنتج من جهازك
    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e => handleImageFile(e.target.files?.[0])} />
  </label>
  <small>JPG أو PNG أو WebP — بحد أقصى 5MB</small>
  {uploading && <p>جارٍ رفع الصورة...</p>}
  {form.image && <img className="ad-image-preview" src={form.image} alt="معاينة صورة المنتج" />}
  <label>رابط الصورة
    <input type="url" value={form.image} onChange={e => set('image', e.target.value)} required />
  </label>
</div>
'@
$src = $src.Remove($imageMatch.Index, $imageMatch.Length).Insert($imageMatch.Index, $imageField.Trim())
$src = [regex]::Replace($src, 'disabled=\{saving\}', 'disabled={saving || uploading}', 1)

# Sanity check before writing.
if (!$src.Contains("from 'firebase/storage'")) { throw 'Storage import was not added; no file written.' }
if (!$src.Contains('handleImageFile')) { throw 'Image upload handler was not added; no file written.' }
if (!$src.Contains('ad-image-preview')) { throw 'Image picker field was not added; no file written.' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$adminFile.before-image-upload-$stamp.bak"
Copy-Item -LiteralPath $adminFile -Destination $backup
[System.IO.File]::WriteAllText($adminFile, $src, [System.Text.UTF8Encoding]::new($false))

$css = [System.IO.File]::ReadAllText($cssFile)
if (!$css.Contains('.ad-image-upload')) {
  $cssAdd = @'

.ad-image-upload { display: grid; gap: 10px; min-width: 0; }
.ad-image-upload input[type="file"] { display: block; width: 100%; margin-top: 8px; }
.ad-image-upload small { color: #776b5d; }
.ad-image-preview { display: block; width: 180px; height: 180px; object-fit: contain; border: 1px solid #e5dbce; border-radius: 10px; background: #fff; padding: 6px; }
'@
  [System.IO.File]::WriteAllText($cssFile, $css + $cssAdd, [System.Text.UTF8Encoding]::new($false))
}

Write-Host 'Updated AdminApp.jsx and Admin.css successfully.' -ForegroundColor Green
Write-Host "Backup created: $backup"
Write-Host 'Next: run npm.cmd run build inside frontend. Upload requires Firebase Storage enabled and appropriate Storage rules.'
