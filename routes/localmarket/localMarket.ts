// Migrated to TypeScript
import {
  Router,
  Request,
  Response,
  RequestHandler,
  NextFunction,
} from "express";
import multer, { StorageEngine } from "multer";
import { GridFSBucket, ObjectId } from "mongodb";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose, { Types } from "mongoose";
import crypto from "crypto";
import path from "path";
import LocalMarketProduct, {
  ILocalMarketProduct,
} from "../../models/LocalMarketProduct";
import Category from "../../models/Category";
import { auth } from "../../middleware/auth";
import vendorMiddleware from "../../middleware/vendorMiddleware";
import { RequestWithFiles } from "../../types/express";
import Order from "../../models/Order";

const router = Router();

let gfs: GridFSBucket;

// Initialize GridFS
mongoose.connection.once("open", () => {
  gfs = new GridFSBucket(mongoose.connection.db, {
    bucketName: "uploads",
  });
});

// Create storage engine for GridFS
const storage: StorageEngine = new GridFsStorage({
  url: process.env.MONGO_URI as string,
  options: { useNewUrlParser: true, useUnifiedTopology: true },
  file: (req: Express.Request, file: Express.Multer.File) => {
    return new Promise((resolve) => {
      crypto.randomBytes(16, (err, buf) => {
        const filename = buf.toString("hex") + path.extname(file.originalname);
        const fileInfo = {
          filename: filename,
          bucketName: "uploads",
        };
        resolve(fileInfo);
      });
    });
  },
}) as unknown as StorageEngine;

// Configure multer with specific field names and limits
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5, // Maximum 5 files
  },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error("Only image files are allowed!"));
    }
    cb(null, true);
  },
});

// Middleware to parse FormData fields
const parseFormDataFields = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Parse discount if it exists and is a string
    if (req.body.discount && typeof req.body.discount === "string") {
      try {
        req.body.discount = JSON.parse(req.body.discount);
      } catch (e) {
        console.error("Error parsing discount:", e);
        req.body.discount = undefined;
      }
    }

    // Only parse 'vendor' if it looks like a JSON object
    if (
      req.body.vendor &&
      typeof req.body.vendor === "string" &&
      req.body.vendor.trim().startsWith("{")
    ) {
      try {
        req.body.vendor = JSON.parse(req.body.vendor);
      } catch (e) {
        console.error(`Error parsing vendor:`, e);
      }
    }

    next();
  } catch (error) {
    console.error("Error in parseFormDataFields middleware:", error);
    next(error);
  }
};

// Define transformed product type for response
interface TransformedProduct {
  id: string;
  name: string;
  price: string;
  description?: string;
  detailedDescription?: string;
  origin?: string;
  usageInstructions?: string;
  careInstructions?: string;
  nutritionalInfo?: string;
  image?: string;
  multipleImages?: string[];
  category?: {
    id: string;
    name: string;
  };
  vendor: {
    id: string;
    name: string;
    mobile: string;
    address: string;
  };
  rating?: number;
  featured?: boolean;
  stock: number;
  discount?: {
    percentage: number;
    validFrom: Date;
    validUntil: Date;
    isActive: boolean;
  };
}

// Define discount type
interface Discount {
  percentage: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
}

// Define raw discount type (what we receive from the client)
interface RawDiscount {
  percentage: string | number;
  validFrom: string | Date;
  validUntil: string | Date;
  isActive?: boolean;
}

// Define type for populated product
interface PopulatedProduct
  extends Omit<ILocalMarketProduct, "category" | "vendor"> {
  category?: {
    _id: Types.ObjectId;
    name: string;
  };
  vendor: {
    _id: Types.ObjectId;
    name: string;
    mobile: string;
    address: string;
  };
}

// Helper functions
const getFullUrl = (req: Request, filename: string): string => {
  const baseUrl = req.protocol + "://" + req.get("host");
  return `${baseUrl}/api/images/${filename}`;
};

const formatPrice = (price: number): string => {
  return (
    "₹" +
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(price)
  );
};

// GET image - must be before the /:id route
router.get(
  "/image/:filename",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filename = req.params.filename;
      const file = await gfs.find({ filename }).toArray();
      if (!file || file.length === 0) {
        res.status(404).json({ msg: "No file exists" });
        return;
      }

      // Set appropriate content type
      const contentType = file[0].contentType || "image/jpeg";
      res.set("Content-Type", contentType);

      // Set cache control headers
      res.set("Cache-Control", "public, max-age=31536000"); // Cache for 1 year

      const downloadStream = gfs.openDownloadStreamByName(filename);

      // Handle stream errors
      downloadStream.on("error", (error) => {
        console.error("Stream error:", error);
        if (!res.headersSent) {
          res.status(500).json({ msg: "Error streaming file" });
        }
      });

      downloadStream.pipe(res);
    } catch (err: any) {
      console.error(err.message);
      if (!res.headersSent) {
        res.status(500).json({ msg: "Server error" });
      }
    }
  }
);

// GET all products (public)
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const products = await LocalMarketProduct.find({ isActive: true })
      .populate("category", "name")
      .populate("vendor", "name mobile address")
      .lean();

    const transformedProducts: TransformedProduct[] = products.map(
      (product: any) => ({
        id: product._id.toString(),
        name: product.name,
        price: formatPrice(product.price),
        description: product.description,
        detailedDescription: product.detailedDescription,
        origin: product.origin,
        usageInstructions: product.usageInstructions,
        careInstructions: product.careInstructions,
        nutritionalInfo: product.nutritionalInfo,
        image: product.image ? getFullUrl(req, product.image) : undefined,
        multipleImages:
          product.multipleImages && product.multipleImages.length > 0
            ? product.multipleImages.map((img: string) => getFullUrl(req, img))
            : undefined,
        category: product.category
          ? {
              id: product.category._id.toString(),
              name: product.category.name,
            }
          : undefined,
        vendor: product.vendor
          ? {
              id: product.vendor._id.toString(),
              name: product.vendor.name,
              mobile: product.vendor.mobile,
              address: product.vendor.address,
            }
          : {
              id: "unknown",
              name: "Unknown Vendor",
              mobile: "N/A",
              address: "N/A",
            },
        rating: product.rating,
        featured: product.featured,
        stock: product.stock,
        discount: product.discount
          ? {
              percentage: product.discount.percentage,
              validFrom: product.discount.validFrom,
              validUntil: product.discount.validUntil,
              isActive: product.discount.isActive,
            }
          : undefined,
      })
    );

    res.json(transformedProducts);
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// GET single product by ID (public)
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const product = (await LocalMarketProduct.findOne({
      _id: req.params.id,
      isActive: true,
    })
      .populate("category", "name")
      .populate("vendor", "name mobile address")
      .lean()) as PopulatedProduct;

    if (!product) {
      res.status(404).json({ msg: "Product not found" });
      return;
    }

    const transformedProduct: TransformedProduct = {
      id: product._id.toString(),
      name: product.name,
      price: formatPrice(product.price),
      description: product.description,
      detailedDescription: product.detailedDescription,
      origin: product.origin,
      usageInstructions: product.usageInstructions,
      careInstructions: product.careInstructions,
      nutritionalInfo: product.nutritionalInfo,
      image: product.image ? getFullUrl(req, product.image) : undefined,
      multipleImages:
        product.multipleImages && product.multipleImages.length > 0
          ? product.multipleImages.map((img: string) => getFullUrl(req, img))
          : undefined,
      category: product.category
        ? {
            id: product.category._id.toString(),
            name: product.category.name,
          }
        : undefined,
      vendor: product.vendor
        ? {
            id: product.vendor._id.toString(),
            name: product.vendor.name,
            mobile: product.vendor.mobile,
            address: product.vendor.address,
          }
        : {
            id: "unknown",
            name: "Unknown Vendor",
            mobile: "N/A",
            address: "N/A",
          },
      rating: product.rating,
      featured: product.featured,
      stock: product.stock,
      discount: product.discount
        ? {
            percentage: product.discount.percentage,
            validFrom: product.discount.validFrom,
            validUntil: product.discount.validUntil,
            isActive: product.discount.isActive,
          }
        : undefined,
    };

    res.json(transformedProduct);
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// Helper function to type check middleware
const withAuth = (handler: RequestHandler): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ msg: "Not authenticated" });
      return;
    }
    return handler(req, res, next);
  };
};

// POST new product (vendor only)
router.post(
  "/",
  auth as RequestHandler,
  vendorMiddleware as RequestHandler,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "multipleImages", maxCount: 5 },
  ]),
  parseFormDataFields,
  async (req: RequestWithFiles, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ msg: "Not authenticated" });
        return;
      }

      // Ensure only vendors can create products
      if (req.user.role !== "vendor") {
        res.status(403).json({ msg: "Only vendors can create products" });
        return;
      }

      const {
        name,
        description,
        detailedDescription,
        price,
        origin,
        usageInstructions,
        careInstructions,
        nutritionalInfo,
        category,
        stock,
        discount,
      } = req.body;

      if (!name || !price || !stock) {
        res.status(400).json({ msg: "Name, price, and stock are required" });
        return;
      }

      if (category) {
        const categoryDoc = await Category.findById(category);
        if (!categoryDoc) {
          res.status(400).json({ msg: "Invalid category provided" });
          return;
        }
      }

      // Handle single image
      let imagePath = "";
      if (req.files && req.files["image"] && req.files["image"].length > 0) {
        imagePath = req.files["image"][0].filename;
      }

      // Handle multiple images
      let multipleImages: string[] | undefined = undefined;
      if (
        req.files &&
        req.files["multipleImages"] &&
        req.files["multipleImages"].length > 0
      ) {
        multipleImages = req.files["multipleImages"].map(
          (file: any) => file.filename
        );
      }

      // Handle discount object
      let discountObj: Discount | undefined = undefined;
      if (discount) {
        try {
          let rawDiscount: RawDiscount;
          if (typeof discount === "string") {
            rawDiscount = JSON.parse(discount);
          } else if (typeof discount === "object") {
            rawDiscount = discount as RawDiscount;
          } else {
            throw new Error("Invalid discount format");
          }

          // Validate discount data
          if (
            !rawDiscount.percentage ||
            isNaN(Number(rawDiscount.percentage))
          ) {
            throw new Error("Invalid discount percentage");
          }

          const validFrom = new Date(rawDiscount.validFrom);
          const validUntil = new Date(rawDiscount.validUntil);

          if (isNaN(validFrom.getTime()) || isNaN(validUntil.getTime())) {
            throw new Error("Invalid discount dates");
          }

          discountObj = {
            percentage: Number(rawDiscount.percentage),
            validFrom,
            validUntil,
            isActive: true,
          };
        } catch (error) {
          console.error("Error parsing discount:", error);
          res.status(400).json({
            msg: "Invalid discount format",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return;
        }
      }

      const newProduct = new LocalMarketProduct({
        name,
        description,
        detailedDescription,
        price: Number(price),
        image: imagePath,
        multipleImages,
        origin,
        usageInstructions,
        careInstructions,
        nutritionalInfo,
        category: category ? new mongoose.Types.ObjectId(category) : undefined,
        vendor: req.user.id,
        stock: Number(stock),
        discount: discountObj,
      });

      const savedProduct = await newProduct.save();
      res.json(savedProduct);
    } catch (err: any) {
      console.error(err.message);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);

// PUT update product (vendor or admin)
router.put(
  "/product/:id",
  auth as RequestHandler,
  vendorMiddleware as RequestHandler,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "multipleImages", maxCount: 5 },
  ]),
  parseFormDataFields,
  withAuth(async (req: RequestWithFiles, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ msg: "Not authenticated" });
        return;
      }

      const product = await LocalMarketProduct.findById(req.params.id);

      if (!product) {
        res.status(404).json({ msg: "Product not found" });
        return;
      }

      // Check if user is the vendor of this product or admin
      const isVendorOfProduct =
        product.vendor.toString() === req.user.id.toString();
      const isAdmin = req.user.role === "admin";

      if (!isVendorOfProduct && !isAdmin) {
        res.status(403).json({ msg: "Not authorized to update this product" });
        return;
      }

      // Parse the request body
      const {
        name,
        description,
        detailedDescription,
        price,
        origin,
        usageInstructions,
        careInstructions,
        nutritionalInfo,
        category,
        stock,
        discount,
      } = req.body;

      // Handle discount object
      if (discount) {
        try {
          let rawDiscount: RawDiscount;
          if (typeof discount === "string") {
            rawDiscount = JSON.parse(discount);
          } else if (typeof discount === "object") {
            rawDiscount = discount as RawDiscount;
          } else {
            throw new Error("Invalid discount format");
          }

          // Validate discount data
          if (
            !rawDiscount.percentage ||
            isNaN(Number(rawDiscount.percentage))
          ) {
            throw new Error("Invalid discount percentage");
          }

          const validFrom = new Date(rawDiscount.validFrom);
          const validUntil = new Date(rawDiscount.validUntil);

          if (isNaN(validFrom.getTime()) || isNaN(validUntil.getTime())) {
            throw new Error("Invalid discount dates");
          }

          product.discount = {
            percentage: Number(rawDiscount.percentage),
            validFrom,
            validUntil,
            isActive: true,
          };
        } catch (error) {
          console.error("Error parsing discount:", error);
          res.status(400).json({
            msg: "Invalid discount format",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return;
        }
      }

      if (category) {
        const categoryDoc = await Category.findById(category);
        if (!categoryDoc) {
          res.status(400).json({ msg: "Invalid category provided" });
          return;
        }
        product.category = new mongoose.Types.ObjectId(category);
      }

      if (name) product.name = name;
      if (description !== undefined) product.description = description;
      if (detailedDescription !== undefined)
        product.detailedDescription = detailedDescription;
      if (price !== undefined) product.price = Number(price);
      if (origin !== undefined) product.origin = origin;
      if (usageInstructions !== undefined)
        product.usageInstructions = usageInstructions;
      if (careInstructions !== undefined)
        product.careInstructions = careInstructions;
      if (nutritionalInfo !== undefined)
        product.nutritionalInfo = nutritionalInfo;
      if (stock !== undefined) product.stock = Number(stock);

      // Handle image upload
      if (req.files && req.files["image"] && req.files["image"].length > 0) {
        // Delete old image if it exists
        if (product.image) {
          try {
            const file = await gfs.find({ filename: product.image }).toArray();
            if (file.length > 0) {
              await gfs.delete(file[0]._id);
            }
          } catch (error) {
            console.error("Error deleting old image:", error);
          }
        }
        // Set new image
        product.image = req.files["image"][0].filename;
      }

      // Handle multiple images upload
      if (
        req.files &&
        req.files["multipleImages"] &&
        req.files["multipleImages"].length > 0
      ) {
        // Delete old multiple images if they exist
        if (product.multipleImages && product.multipleImages.length > 0) {
          for (const filename of product.multipleImages) {
            try {
              const file = await gfs.find({ filename }).toArray();
              if (file.length > 0) {
                await gfs.delete(file[0]._id);
              }
            } catch (error) {
              console.error("Error deleting old multiple image:", error);
            }
          }
        }
        // Set new multiple images
        product.multipleImages = req.files["multipleImages"].map(
          (file: any) => file.filename
        );
      }

      await product.save();

      // Return the updated product with populated fields
      const updatedProduct = await LocalMarketProduct.findById(product._id)
        .populate("category", "name")
        .populate("vendor", "name mobile address")
        .lean();

      res.json(updatedProduct);
    } catch (err: any) {
      console.error(err.message);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  })
);

// DELETE product (vendor or admin)
router.delete(
  "/:id",
  [auth, vendorMiddleware] as RequestHandler[],
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ msg: "Not authenticated" });
        return;
      }

      const product = await LocalMarketProduct.findById(req.params.id);
      if (!product) {
        res.status(404).json({ msg: "Product not found" });
        return;
      }

      // Check if user is the vendor of this product or admin
      const isVendorOfProduct =
        product.vendor.toString() === req.user.id.toString();
      const isAdmin = req.user.role === "admin";

      if (!isVendorOfProduct && !isAdmin) {
        res.status(403).json({ msg: "Not authorized to delete this product" });
        return;
      }

      // Delete associated images from GridFS
      if (product.image) {
        const file = await gfs.find({ filename: product.image }).toArray();
        if (file.length > 0) {
          await gfs.delete(file[0]._id);
        }
      }

      if (product.multipleImages && product.multipleImages.length > 0) {
        for (const filename of product.multipleImages) {
          const file = await gfs.find({ filename }).toArray();
          if (file.length > 0) {
            await gfs.delete(file[0]._id);
          }
        }
      }

      await product.deleteOne();
      res.json({ msg: "Product and associated images removed" });
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }
);

// GET image
router.get(
  ["/image/:filename", "/:filename"],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filename = req.params.filename;
      const file = await gfs.find({ filename }).toArray();
      if (!file || file.length === 0) {
        res.status(404).json({ msg: "No file exists" });
        return;
      }

      // Set appropriate content type
      const contentType = file[0].contentType || "image/jpeg";
      res.set("Content-Type", contentType);

      // Set cache control headers
      res.set("Cache-Control", "public, max-age=31536000"); // Cache for 1 year

      const downloadStream = gfs.openDownloadStreamByName(filename);

      // Handle stream errors
      downloadStream.on("error", (error) => {
        console.error("Stream error:", error);
        if (!res.headersSent) {
          res.status(500).json({ msg: "Error streaming file" });
        }
      });

      downloadStream.pipe(res);
    } catch (err: any) {
      console.error(err.message);
      if (!res.headersSent) {
        res.status(500).json({ msg: "Server error" });
      }
    }
  }
);

// DELETE an image (vendor or admin)
router.delete(
  "/image/:filename",
  auth as RequestHandler,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ msg: "Not authenticated" });
        return;
      }

      const file = await gfs.find({ filename: req.params.filename }).toArray();
      if (!file || file.length === 0) {
        res.status(404).json({ msg: "No file exists" });
        return;
      }

      // Check if user is admin
      if (req.user.role === "admin") {
        await gfs.delete(file[0]._id);
        res.json({ msg: "File deleted" });
        return;
      }

      // For vendors, check if the image belongs to their product
      const product = await LocalMarketProduct.findOne({
        $or: [
          { image: req.params.filename },
          { multipleImages: req.params.filename },
        ],
      });

      if (!product) {
        res.status(404).json({ msg: "Image not associated with any product" });
        return;
      }

      if (product.vendor.toString() !== req.user.id) {
        res.status(403).json({ msg: "Not authorized to delete this image" });
        return;
      }

      await gfs.delete(file[0]._id);
      res.json({ msg: "File deleted" });
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }
);

// Get vendor's products
router.get(
  "/vendor/products",
  [auth, vendorMiddleware] as RequestHandler[],
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ msg: "Not authenticated" });
        return;
      }

      const products = await LocalMarketProduct.find({
        vendor: req.user.id,
      })
        .populate("category", "name")
        .populate("vendor", "name mobile address")
        .lean();

      const transformedProducts = products.map((product: any) => ({
        id: product._id.toString(),
        name: product.name,
        price: formatPrice(product.price),
        description: product.description,
        detailedDescription: product.detailedDescription,
        origin: product.origin,
        usageInstructions: product.usageInstructions,
        careInstructions: product.careInstructions,
        nutritionalInfo: product.nutritionalInfo,
        image: product.image ? getFullUrl(req, product.image) : undefined,
        multipleImages:
          product.multipleImages && product.multipleImages.length > 0
            ? product.multipleImages.map((img: string) => getFullUrl(req, img))
            : undefined,
        category: product.category
          ? {
              id: product.category._id.toString(),
              name: product.category.name,
            }
          : undefined,
        vendor: {
          id: product.vendor._id.toString(),
          name: product.vendor.name,
          mobile: product.vendor.mobile,
          address: product.vendor.address,
        },
        rating: product.rating,
        featured: product.featured,
        stock: product.stock,
        discount: product.discount
          ? {
              percentage: product.discount.percentage,
              validFrom: product.discount.validFrom,
              validUntil: product.discount.validUntil,
              isActive: product.discount.isActive,
            }
          : undefined,
      }));

      res.json(transformedProducts);
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }
);

// Get all products grouped by vendors (admin only)
router.get(
  "/admin/vendors/products",
  auth as RequestHandler,
  vendorMiddleware as RequestHandler,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ msg: "Not authenticated" });
        return;
      }

      const products = await LocalMarketProduct.find()
        .populate("category", "name")
        .populate("vendor", "name mobile address")
        .lean();

      // Group products by vendor
      const vendorProducts = products.reduce((acc: any, product: any) => {
        const vendorId = product.vendor._id.toString();
        if (!acc[vendorId]) {
          acc[vendorId] = {
            vendor: {
              id: vendorId,
              name: product.vendor.name,
              mobile: product.vendor.mobile,
              address: product.vendor.address,
            },
            products: [],
          };
        }

        acc[vendorId].products.push({
          id: product._id.toString(),
          name: product.name,
          price: formatPrice(product.price),
          description: product.description,
          detailedDescription: product.detailedDescription,
          origin: product.origin,
          usageInstructions: product.usageInstructions,
          careInstructions: product.careInstructions,
          nutritionalInfo: product.nutritionalInfo,
          image: product.image ? getFullUrl(req, product.image) : undefined,
          multipleImages:
            product.multipleImages && product.multipleImages.length > 0
              ? product.multipleImages.map((img: string) =>
                  getFullUrl(req, img)
                )
              : undefined,
          category: product.category
            ? {
                id: product.category._id.toString(),
                name: product.category.name,
              }
            : undefined,
          rating: product.rating,
          featured: product.featured,
          stock: product.stock,
          discount: product.discount
            ? {
                percentage: product.discount.percentage,
                validFrom: product.discount.validFrom,
                validUntil: product.discount.validUntil,
                isActive: product.discount.isActive,
              }
            : undefined,
        });

        return acc;
      }, {});

      // Convert to array format
      const result = Object.values(vendorProducts);

      res.json(result);
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }
);

// Rate a product (only for users who have bought it)
router.post(
  "/product/:id/rate",
  auth as RequestHandler,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ msg: "Not authenticated" });
        return;
      }

      const { rating } = req.body;
      if (!rating || typeof rating !== "number" || rating < 0 || rating > 5) {
        res
          .status(400)
          .json({ msg: "Invalid rating. Must be a number between 0 and 5" });
        return;
      }

      const product = await LocalMarketProduct.findById(req.params.id);
      if (!product) {
        res.status(404).json({ msg: "Product not found" });
        return;
      }

      // Check if user has bought this product
      const order = await Order.findOne({
        user: req.user.id,
        items: {
          $elemMatch: {
            product: product._id,
          },
        },
        status: "delivered", // Only allow rating after delivery
      });

      if (!order) {
        res.status(403).json({
          msg: "You can only rate products you have purchased and received",
        });
        return;
      }

      // Update the rating
      const currentRating = product.rating || 0;
      const totalRatings = product.boughtBy;
      const newRating =
        (currentRating * totalRatings + rating) / (totalRatings + 1);

      product.rating = newRating;
      product.boughtBy = totalRatings + 1;
      await product.save();

      res.json({
        msg: "Rating updated successfully",
        newRating: newRating,
        totalRatings: totalRatings + 1,
      });
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }
);

export default router;
