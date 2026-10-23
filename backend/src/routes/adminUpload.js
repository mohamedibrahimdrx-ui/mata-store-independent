
const express = require("express");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");

const router = express.Router();

// Verify the real file signature (the client-supplied mimetype can be spoofed).
function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Log requests reaching this router
router.use((req, res, next) => {
  console.log(
    "Admin upload route reached:",
    req.method,
    req.originalUrl
  );
  next();
});

// Accept images in memory, with a 5 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter(req, file, callback) {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error(
          "نوع الصورة غير مسموح. استخدم JPG أو PNG أو WebP."
        )
      );
    }

    callback(null, true);
  },
});

// POST /api/admin/upload
// This router must be mounted behind requireAdmin.
router.post(
  "/",
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        const tooLarge =
          err instanceof multer.MulterError &&
          err.code === "LIMIT_FILE_SIZE";

        return res.status(400).json({
          error: tooLarge ? "IMAGE_TOO_LARGE" : "INVALID_IMAGE",
          message: tooLarge
            ? "حجم الصورة يجب ألا يتجاوز 5 ميجابايت."
            : err.message,
        });
      }

      next();
    });
  },
  async (req, res) => {
    // Check configuration without exposing secrets
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      console.error("Cloudinary configuration is incomplete.");

      return res.status(503).json({
        error: "IMAGE_SERVICE_NOT_CONFIGURED",
        message: "خدمة رفع الصور غير مكتملة الإعداد.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "IMAGE_REQUIRED",
        message: "اختار صورة الأول.",
      });
    }

    const realType = detectImageType(req.file.buffer);
    if (!realType || realType !== req.file.mimetype) {
      return res.status(400).json({
        error: "INVALID_IMAGE",
        message: "محتوى الملف مش صورة JPG أو PNG أو WebP صالحة.",
      });
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "mata/products",
            resource_type: "image",
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
          },
          (error, uploadedImage) => {
            if (error) {
              return reject(error);
            }

            resolve(uploadedImage);
          }
        );

        stream.on("error", reject);
        stream.end(req.file.buffer);
      });

      if (!result || !result.secure_url) {
        throw new Error("Cloudinary did not return an image URL.");
      }

      console.log("Cloudinary upload successful:", result.public_id);

      return res.status(201).json({
        image: result.secure_url,
        publicId: result.public_id,
      });
    } catch (error) {
      // Log useful diagnostics, never log API secrets
      console.error("Cloudinary upload failed:", {
        message: error.message,
        name: error.name,
        http_code: error.http_code,
        error: error.error,
      });

      return res.status(502).json({
        error: "IMAGE_UPLOAD_FAILED",
        message: "فشل رفع الصورة. راجع إعدادات Cloudinary.",
      });
    }
  }
);

// Handle unexpected router errors
router.use((err, req, res, next) => {
  console.error("Admin upload route error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    error: "UPLOAD_SERVER_ERROR",
    message: "حدث خطأ داخلي أثناء معالجة الصورة.",
  });
});


// ---------------------------------------------------------------------------
// Product video upload: POST /api/admin/upload/video  (field name: "video")
// Videos are much heavier than images and consume Cloudinary credits (storage + bandwidth),
// so the limit is separate and configurable: MAX_VIDEO_UPLOAD_MB (default 50).
// For long videos prefer pasting a YouTube/Vimeo link instead of uploading.
// ---------------------------------------------------------------------------
const MAX_VIDEO_MB = Math.min(Math.max(Number(process.env.MAX_VIDEO_UPLOAD_MB) || 50, 1), 100);

function detectVideoType(buf) {
  if (!buf || buf.length < 16) return null;
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return "mp4-or-mov"; // MP4 / MOV (ISO base media)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  return null;
}

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_MB * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.mimetype)) {
      return callback(new Error("نوع الفيديو غير مسموح. استخدم MP4 أو WebM أو MOV."));
    }
    callback(null, true);
  },
});

router.post(
  "/video",
  (req, res, next) => {
    videoUpload.single("video")(req, res, (err) => {
      if (err) {
        const tooLarge = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
        return res.status(400).json({
          error: tooLarge ? "VIDEO_TOO_LARGE" : "INVALID_VIDEO",
          message: tooLarge ? `حجم الفيديو يجب ألا يتجاوز ${MAX_VIDEO_MB} ميجابايت. للفيديوهات الطويلة استخدم رابط YouTube أو Vimeo.` : err.message,
        });
      }
      next();
    });
  },
  async (req, res) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error("Cloudinary configuration is incomplete.");
      return res.status(503).json({ error: "IMAGE_SERVICE_NOT_CONFIGURED", message: "خدمة الرفع غير مكتملة الإعداد." });
    }
    if (!req.file) return res.status(400).json({ error: "VIDEO_REQUIRED", message: "اختار فيديو الأول." });
    if (!detectVideoType(req.file.buffer)) {
      return res.status(400).json({ error: "INVALID_VIDEO", message: "محتوى الملف مش فيديو MP4 أو WebM أو MOV صالح." });
    }
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "mata/videos", resource_type: "video", allowed_formats: ["mp4", "webm", "mov"] },
          (error, uploaded) => (error ? reject(error) : resolve(uploaded))
        );
        stream.on("error", reject);
        stream.end(req.file.buffer);
      });
      if (!result || !result.secure_url) throw new Error("Cloudinary did not return a video URL.");
      console.log("Cloudinary video upload successful:", result.public_id);
      return res.status(201).json({ video: result.secure_url });
    } catch (error) {
      // Safe diagnostics: no secrets, no file contents.
      console.error("Cloudinary video upload failed:", { message: error.message, httpCode: error.http_code });
      return res.status(502).json({ error: "VIDEO_UPLOAD_FAILED", message: "فشل رفع الفيديو إلى Cloudinary. راجع إعدادات الحساب أو استخدم رابط فيديو." });
    }
  }
);

module.exports = router;
