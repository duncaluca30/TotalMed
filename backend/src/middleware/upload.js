const multer = require('multer');
const { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } = require('../services/attachment.service');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
        cb(new Error('Unsupported file type. Allowed: PDF, PNG, JPEG, WEBP.'));
    }
});

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
