// config/multer.js
import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, path.join(process.cwd(), "uploads"));
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `report_${Date.now()}${ext}`);
  },
});

export const upload = multer({ storage });
