$ErrorActionPreference = 'Stop'
$frontend = Join-Path $PSScriptRoot 'frontend'
$adminFile = Join-Path $frontend 'src\AdminApp.jsx'
$firebaseFile = Join-Path $frontend 'src\firebase.js'
if (!(Test-Path $adminFile)) { throw "Couldn't find $adminFile" }
if (!(Test-Path $firebaseFile)) { throw "Couldn't find $firebaseFile" }

$src = [System.IO.File]::ReadAllText($adminFile)
if ($src.Contains("from 'firebase/storage'")) { Write-Host 'Firebase Storage import already exists; stopping to avoid duplicate edits.'; exit 0 }

$backup = "$adminFile.before-image-upload.bak"
Copy-Item $adminFile $backup -Force

$authImport = "import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'"
if (!$src.Contains($authImport)) { throw 'Could not locate Firebase auth import. No changes made.' }
$src = $src.Replace($authImport, $authImport + "`r`nimport { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'")

$cssImport = "import './Admin.css'"
if (!$src.Contains($cssImport)) { throw 'Could not locate Admin.css import. No changes made.' }
$src = $src.Replace($cssImport, $cssImport + "`r`n`r`nconst storage = getStorage()")

# Match the error state regardless of whitespace/indentation.
$statePattern = "(?m)^\s*const\s+\[error\s*,\s*setError\]\s*=\s*useState\(''\)\s*$"
$stateMatch = [regex]::Match($src, $statePattern)
if (!$stateMatch.Success) { throw 'Could not locate ProductEditor error state. No changes written.' }
$stateInsert = @'
  const [error,setError] = useState('')
  const [uploading,setUploading] = useState(false)
  async function handleImageFile(file) {
    if (!file) return
    setError('')
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
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
      setError('فشل رفع الصورة. تأكد من تفعيل Firebase Storage وقواعد الصلاحيات. ' + (err?.code || ''))
    } finally {
      setUploading(false)
    }
  }
'@
$src = $src.Remove($stateMatch.Index, $stateMatch.Length).Insert($stateMatch.Index, $stateInsert.TrimEnd())

# Replace the existing URL image label, allowing whitespace variations.
$imagePattern = '<label>رابط الصورة\s*<input\s+type="url"\s+value=\{form\.image\}\s+onChange=\{e=>set\(''image'',e\.target\.value\)\}\s+required\s*/>\s*</label>'
$newImageField = @'
<div className="ad-image-upload ad-wide">
  <label>صورة المنتج من جهازك
    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>handleImageFile(e.target.files?.[0])} />
  </label>
  <small>JPG أو PNG أو WebP — بحد أقصى 5MB</small>
  {uploading && <p>جارٍ رفع الصورة...</p>}
  {form.image && <img className="ad-image-preview" src={form.image} alt="معاينة صورة المنتج" />}
  <label>رابط الصورة
    <input type="url" value={form.image} onChange={e=>set('image',e.target.value)} required />
  </label>
</div>
'@
$src2 = [regex]::Replace($src, $imagePattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $newImageField.Trim() }, 1)
if ($src2 -eq $src) { throw 'Could not locate the existing image URL field. Backup created; source was not written.' }
$src = $src2

# Prevent saving while an upload is in progress.
$src = $src.Replace('disabled={saving}>{saving?', 'disabled={saving||uploading}>{uploading?''جارٍ رفع الصورة... '':saving?')
[System.IO.File]::WriteAllText($adminFile, $src, [System.Text.UTF8Encoding]::new($false))

# Add small preview styles if not already present.
$cssFile = Join-Path $frontend 'src\Admin.css'
if (Test-Path $cssFile) {
  $css = [System.IO.File]::ReadAllText($cssFile)
  if (!$css.Contains('.ad-image-preview')) {
    $css += "`r`n`r`n.ad-image-upload{display:flex;flex-direction:column;gap:10px}.ad-image-preview{display:block;width:180px;height:180px;object-fit:contain;border:1px solid #ddd;border-radius:12px;background:#fff;padding:6px}.ad-image-upload input[type=file]{max-width:100%}`r`n"
    [System.IO.File]::WriteAllText($cssFile, $css, [System.Text.UTF8Encoding]::new($false))
  }
}
Write-Host "Updated AdminApp.jsx and image preview CSS. Backup: $backup"
Write-Host 'Next run: cd frontend; npm.cmd run build'
