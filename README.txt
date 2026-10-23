MATA Store — upload product images from your computer

WHAT THIS PATCH DOES
- Adds a file picker to AdminApp.jsx for JPG, PNG, and WebP images up to 5 MB.
- Uploads the selected file to Firebase Storage and saves the download URL into the existing product image field.
- Keeps an image preview and retains the URL field as an optional fallback.
- Makes a backup of AdminApp.jsx before editing.

INSTALL
1. Extract this folder so its parent directory contains your `frontend` folder, e.g.:
   mata-store-new/
     frontend/
     mata-image-upload-patch/
2. Open PowerShell in `mata-image-upload-patch` and run:
   Set-ExecutionPolicy -Scope Process Bypass
   .\Install-ImageUpload.ps1
   (The script expects `frontend` to be next to this folder's parent. If your folder layout differs, edit `$frontend` near the top.)
3. In Firebase Console, open project `mata-store-eg` > Storage and create/enable a bucket if the console allows it on your current plan.
4. In Firebase Storage Rules, paste `storage.rules.txt`, the rules file already includes the admin UID supplied for this project. Confirm it matches the admin account before publishing. Publish the rules.
5. From `frontend`, run:
   npm.cmd run build
6. Run the app and test image upload with a small, non-sensitive test image.

IMPORTANT
- Firebase Storage availability and billing requirements depend on the Firebase project/bucket state. If Firebase Console asks to upgrade billing, do not enable billing unless you choose to. The upload feature cannot work until Storage is available and rules are published.
- Public read is required here because storefront visitors need to load product images. Upload/update/delete are restricted to the admin UID. Anyone with a download URL may view that image; do not upload private images.
- This patch only changes frontend/src/AdminApp.jsx. It does not touch App.jsx or backend files.
