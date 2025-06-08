import multer from "multer";
import { Request, Response, NextFunction } from "express";

// Configure multer for memory storage
const storage = multer.memoryStorage();

// Allowed file types
const allowedImageTypes = ["image/jpeg", "image/png", "image/jpg"];
const allowedDocumentTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/jpg",
];

// File filter for images
const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (allowedImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type for ${file.fieldname}. Only JPEG, PNG, and JPG images are allowed.`
      )
    );
  }
};

// File filter for documents
const documentFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (allowedDocumentTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type for ${file.fieldname}. Only PDF, DOC, DOCX, and image files are allowed.`
      )
    );
  }
};

// Configure multer upload
export const rentalUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Log the incoming field name and mimetype for debugging
    console.log(
      "Processing field:",
      file.fieldname,
      "Mimetype:",
      file.mimetype
    );

    // Use different file filters based on the field name
    switch (file.fieldname) {
      case "image":
      case "multipleImages":
        return imageFileFilter(req, file, cb);
      case "registration":
      case "insurance":
      case "inspection":
        return documentFileFilter(req, file, cb);
      default:
        // Allow non-file fields to pass through
        if (!file.mimetype) {
          return cb(null, true);
        }
        return cb(
          new Error(
            `Unexpected file field: ${file.fieldname}. Allowed file fields are: image, multipleImages, registration, insurance, inspection`
          )
        );
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
}).fields([
  { name: "image", maxCount: 1 },
  { name: "multipleImages", maxCount: 5 },
  { name: "registration", maxCount: 1 },
  { name: "insurance", maxCount: 1 },
  { name: "inspection", maxCount: 1 },
]);

// Parse JSON fields from form data
export const parseRentalFormDataFields = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Log the request body for debugging
    console.log("Request body fields:", Object.keys(req.body));

    // Handle features field - convert comma-separated string to array
    if (req.body.features) {
      if (typeof req.body.features === "string") {
        if (req.body.features.includes(",")) {
          // If it's a comma-separated string, split it into an array
          req.body.features = req.body.features
            .split(",")
            .map((item: string) => item.trim());
        } else {
          // If it's a single string, convert to array with one item
          req.body.features = [req.body.features.trim()];
        }
      } else {
        try {
          // Try to parse as JSON if it's not already an array
          req.body.features = JSON.parse(req.body.features);
        } catch (error) {
          return res.status(400).json({
            message: "Invalid features format",
            details:
              "Features must be a comma-separated string or a JSON array",
          });
        }
      }
    }

    // Handle other JSON fields
    const jsonFields = [
      "availability",
      "insurance",
      "specifications",
      "pricing",
      "locationDetails",
    ];

    for (const field of jsonFields) {
      if (req.body[field]) {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch (error) {
          return res.status(400).json({
            message: `Invalid JSON in ${field}`,
            details:
              error instanceof Error
                ? error.message
                : "Unknown error parsing JSON",
          });
        }
      }
    }
    next();
  } catch (error) {
    res.status(400).json({
      message: "Error processing form data",
      details:
        error instanceof Error
          ? error.message
          : "Unknown error processing form data",
    });
  }
};
