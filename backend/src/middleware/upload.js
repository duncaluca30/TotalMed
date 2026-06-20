const multer = require('multer');
const { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } = require('../services/attachment.service');

// In-memory upload: the file never touches disk — it's encrypted and written
// straight to Postgres. Size and type are enforced here so a rejected upload
// never reaches the route handler.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
        cb(new Error('Unsupported file type. Allowed: PDF, PNG, JPEG, WEBP.'));
    }
});

// Wrap multer's single-file handler so its errors become clean 400 JSON instead
// of bubbling up as a 500.
function singleFile(field) {
    return (req, res, next) => {
        upload.single(field)(req, res, (err) => {
            if (err) {
                const msg = err.code === 'LIMIT_FILE_SIZE'
                    ? 'File too large (max 2 MB).'
                    : (err.message || 'Upload failed.');
                return res.status(400).json({ error: msg });
            }
            next();
        });
    };
}

module.exports = { singleFile };
