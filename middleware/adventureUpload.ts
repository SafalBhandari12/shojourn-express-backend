import multer from "multer";
import { Request, Response, NextFunction } from "express";

// Multer setup for adventure section (memory storage)
const adventureUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 6, // 1 image + up to 5 multipleImages
  },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error("Only image files are allowed!"));
    }
    cb(null, true);
  },
});

// Middleware to parse JSON fields from form-data
const parseAdventureFormDataFields = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const parseField = (field: string) => {
    if (req.body[field] && typeof req.body[field] === "string") {
      try {
        req.body[field] = JSON.parse(req.body[field]);
      } catch {
        // leave as string if not valid JSON
      }
    }
  };
  [
    "multipleImages",
    "ageRestriction",
    "requirements",
    "schedule",
    "discount",
    "seatAvailability",
  ].forEach(parseField);
  next();
};

export { adventureUpload, parseAdventureFormDataFields };
