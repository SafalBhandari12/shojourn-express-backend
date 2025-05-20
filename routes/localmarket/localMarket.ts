// Migrated to TypeScript
import { Router, Request, Response, RequestHandler } from "express";
import multer from "multer";
import LocalMarketProduct, {
  ILocalMarketProduct,
} from "../../models/LocalMarketProduct";
import Category from "../../models/Category";
import auth from "../../middleware/auth";
import admin from "../../middleware/admin";
import { Types } from "mongoose";

const router = Router();

// Extend Express Request for multer
interface RequestWithFiles extends Request {
  files?: {
    [fieldname: string]: Express.Multer.File[];
  };
  body: {
    name: string;
    description?: string;
    detailedDescription?: string;
    price: string;
    origin?: string;
    usageInstructions?: string;
    careInstructions?: string;
    nutritionalInfo?: string;
    category?: string;
    rating?: string;
    featured?: string;
  };
}

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
  category?: string;
  rating?: number;
  featured?: boolean;
}

// Define request body type for product operations
interface ProductRequestBody {
  name: string;
  description?: string;
  detailedDescription?: string;
  price: string;
  origin?: string;
  usageInstructions?: string;
  careInstructions?: string;
  nutritionalInfo?: string;
  category?: string;
  rating?: string;
  featured?: string;
}

// Setup Multer storage configuration
const storage = multer.diskStorage({
  destination: (
    _req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => {
    cb(null, "uploads/");
  },
  filename: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// Helper functions
const getFullUrl = (req: Request, filePath: string): string => {
  const baseUrl = req.protocol + "://" + req.get("host");
  const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${baseUrl}/${normalizedPath}`;
};

const formatPrice = (price: number): string => {
  return (
    "₹" +
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(price)
  );
};

// GET all products
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const products = await LocalMarketProduct.find().populate("category");

    const transformedProducts: TransformedProduct[] = products.map(
      (product: ILocalMarketProduct & { category?: any }) => ({
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
        category: product.category?.name || product.category,
        rating: product.rating,
        featured: product.featured,
      })
    );

    res.json(transformedProducts);
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// POST new product
router.post(
  "/",
  auth,
  admin,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "multipleImages", maxCount: 5 },
  ]),
  (async (req: RequestWithFiles, res: Response) => {
    try {
      const reqWithFiles = req as RequestWithFiles;
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
        rating,
        featured,
      } = reqWithFiles.body;

      if (!name || !price) {
        res.status(400).json({ msg: "Name and price are required" });
        return;
      }

      if (category) {
        const categoryDoc = await Category.findById(category);
        if (!categoryDoc) {
          res.status(400).json({ msg: "Invalid category provided" });
          return;
        }
      }

      let imagePath = "";
      if (
        reqWithFiles.files &&
        reqWithFiles.files["image"] &&
        reqWithFiles.files["image"][0]
      ) {
        imagePath = reqWithFiles.files["image"][0].path;
      }

      let multipleImagesPaths: string[] = [];
      if (reqWithFiles.files && reqWithFiles.files["multipleImages"]) {
        multipleImagesPaths = reqWithFiles.files["multipleImages"].map(
          (file) => file.path
        );
      }

      const newProduct = new LocalMarketProduct({
        name,
        description,
        detailedDescription,
        price: Number(price),
        image: imagePath,
        multipleImages: multipleImagesPaths,
        origin,
        usageInstructions,
        careInstructions,
        nutritionalInfo,
        category: category ? new Types.ObjectId(category) : undefined,
        rating: rating ? Number(rating) : undefined,
        featured: featured === "true",
      });

      const savedProduct = await newProduct.save();
      res.json(savedProduct);
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }) as RequestHandler
);

// PUT update product
router.put(
  "/:id",
  auth,
  admin,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "multipleImages", maxCount: 5 },
  ]),
  (async (req: RequestWithFiles, res: Response) => {
    try {
      const reqWithFiles = req as RequestWithFiles;
      const product = await LocalMarketProduct.findById(req.params.id);
      if (!product) {
        res.status(404).json({ msg: "Product not found" });
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
        rating,
        featured,
      } = reqWithFiles.body;

      if (category) {
        const categoryDoc = await Category.findById(category);
        if (!categoryDoc) {
          res.status(400).json({ msg: "Invalid category provided" });
          return;
        }
        product.category = new Types.ObjectId(category);
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
      if (rating !== undefined) product.rating = Number(rating);
      if (featured !== undefined) product.featured = featured === "true";

      if (reqWithFiles.files) {
        if (reqWithFiles.files["image"] && reqWithFiles.files["image"][0]) {
          product.image = reqWithFiles.files["image"][0].path;
        }
        if (reqWithFiles.files["multipleImages"]) {
          product.multipleImages = reqWithFiles.files["multipleImages"].map(
            (file) => file.path
          );
        }
      }

      await product.save();
      res.json(product);
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }) as RequestHandler
);

// DELETE product
router.delete(
  "/:id",
  auth,
  admin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const product = await LocalMarketProduct.findById(req.params.id);
      if (!product) {
        res.status(404).json({ msg: "Product not found" });
        return;
      }
      await product.deleteOne();
      res.json({ msg: "Product removed" });
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }
);

export default router;
