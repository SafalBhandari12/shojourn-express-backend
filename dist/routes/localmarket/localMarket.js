"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Migrated to TypeScript
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const mongodb_1 = require("mongodb");
const multer_gridfs_storage_1 = require("multer-gridfs-storage");
const mongoose_1 = __importStar(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const LocalMarketProduct_1 = __importDefault(require("../../models/LocalMarketProduct"));
const Category_1 = __importDefault(require("../../models/Category"));
const auth_1 = require("../../middleware/auth");
const vendor_1 = require("../../middleware/vendor");
const router = (0, express_1.Router)();
let gfs;
// Initialize GridFS
mongoose_1.default.connection.once("open", () => {
    gfs = new mongodb_1.GridFSBucket(mongoose_1.default.connection.db, {
        bucketName: "uploads",
    });
});
// Create storage engine for GridFS
const storage = new multer_gridfs_storage_1.GridFsStorage({
    url: process.env.MONGO_URI,
    options: { useNewUrlParser: true, useUnifiedTopology: true },
    file: (req, file) => {
        return new Promise((resolve) => {
            crypto_1.default.randomBytes(16, (err, buf) => {
                const filename = buf.toString("hex") + path_1.default.extname(file.originalname);
                const fileInfo = {
                    filename: filename,
                    bucketName: "uploads",
                };
                resolve(fileInfo);
            });
        });
    },
});
const upload = (0, multer_1.default)({ storage });
// Helper functions
const getFullUrl = (req, filename) => {
    const baseUrl = req.protocol + "://" + req.get("host");
    return `${baseUrl}/api/images/${filename}`;
};
const formatPrice = (price) => {
    return ("₹" +
        new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(price));
};
// GET all products (public)
router.get("/", async (req, res) => {
    try {
        const products = await LocalMarketProduct_1.default.find({ isActive: true }).populate("category");
        const transformedProducts = products.map((product) => ({
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
            multipleImages: product.multipleImages && product.multipleImages.length > 0
                ? product.multipleImages.map((img) => getFullUrl(req, img))
                : undefined,
            category: product.category?.name || product.category,
            rating: product.rating,
            featured: product.featured,
            stock: product.stock,
            discount: product.discount.isActive
                ? {
                    percentage: product.discount.percentage,
                    validUntil: product.discount.validUntil,
                }
                : undefined,
        }));
        res.json(transformedProducts);
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});
// Helper function to type check middleware
const withAuth = (handler) => {
    return async (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ msg: "Not authenticated" });
            return;
        }
        return handler(req, res, next);
    };
};
// POST new product (vendor only)
router.post("/", auth_1.auth, vendor_1.vendor, upload.fields([
    { name: "image", maxCount: 1 },
    { name: "multipleImages", maxCount: 5 },
]), withAuth(async (req, res) => {
    try {
        const { name, description, detailedDescription, price, origin, usageInstructions, careInstructions, nutritionalInfo, category, stock, discount, } = req.body;
        console.log(req.body);
        if (!name || !price || !stock) {
            res.status(400).json({ msg: "Name, price, and stock are required" });
            return;
        }
        if (category) {
            const categoryDoc = await Category_1.default.findById(category);
            if (!categoryDoc) {
                res.status(400).json({ msg: "Invalid category provided" });
                return;
            }
        }
        let imagePath = "";
        const files = req.files;
        if (files && "image" in files && files["image"][0]) {
            imagePath = files["image"][0].filename;
        }
        let multipleImagesPaths = [];
        if (files && "multipleImages" in files) {
            multipleImagesPaths = files["multipleImages"].map((file) => file.filename);
        }
        const newProduct = new LocalMarketProduct_1.default({
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
            category: category ? new mongoose_1.default.Types.ObjectId(category) : undefined,
            vendor: req.user?.id,
            stock: Number(stock),
            discount: discount
                ? {
                    percentage: Number(discount.percentage),
                    validFrom: new Date(discount.validFrom),
                    validUntil: new Date(discount.validUntil),
                    isActive: true,
                }
                : undefined,
        });
        const savedProduct = await newProduct.save();
        res.json(savedProduct);
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
}));
// PUT update product (vendor only)
router.put("/:id", auth_1.auth, vendor_1.vendor, upload.fields([
    { name: "image", maxCount: 1 },
    { name: "multipleImages", maxCount: 5 },
]), withAuth(async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ msg: "Not authenticated" });
            return;
        }
        const product = await LocalMarketProduct_1.default.findById(req.params.id);
        if (!product) {
            res.status(404).json({ msg: "Product not found" });
            return;
        }
        // Check if user is the vendor of this product
        if (product.vendor.toString() !== req.user.id.toString() &&
            req.user.role !== "admin") {
            res.status(403).json({ msg: "Not authorized to update this product" });
            return;
        }
        const { name, description, detailedDescription, price, origin, usageInstructions, careInstructions, nutritionalInfo, category, stock, discount, } = req.body;
        if (category) {
            const categoryDoc = await Category_1.default.findById(category);
            if (!categoryDoc) {
                res.status(400).json({ msg: "Invalid category provided" });
                return;
            }
            product.category = new mongoose_1.Types.ObjectId(category);
        }
        if (name)
            product.name = name;
        if (description !== undefined)
            product.description = description;
        if (detailedDescription !== undefined)
            product.detailedDescription = detailedDescription;
        if (price !== undefined)
            product.price = Number(price);
        if (origin !== undefined)
            product.origin = origin;
        if (usageInstructions !== undefined)
            product.usageInstructions = usageInstructions;
        if (careInstructions !== undefined)
            product.careInstructions = careInstructions;
        if (nutritionalInfo !== undefined)
            product.nutritionalInfo = nutritionalInfo;
        if (stock !== undefined)
            product.stock = Number(stock);
        if (discount) {
            product.discount = {
                percentage: Number(discount.percentage),
                validFrom: new Date(discount.validFrom),
                validUntil: new Date(discount.validUntil),
                isActive: true,
            };
        }
        if (req.files) {
            if ("image" in req.files && req.files["image"][0]) {
                if (product.image) {
                    const file = await gfs.find({ filename: product.image }).toArray();
                    if (file.length > 0) {
                        await gfs.delete(file[0]._id);
                    }
                }
                product.image = req.files["image"][0].filename;
            }
            if ("multipleImages" in req.files) {
                if (product.multipleImages && product.multipleImages.length > 0) {
                    for (const filename of product.multipleImages) {
                        const file = await gfs.find({ filename }).toArray();
                        if (file.length > 0) {
                            await gfs.delete(file[0]._id);
                        }
                    }
                }
                product.multipleImages = req.files["multipleImages"].map((file) => file.filename);
            }
        }
        await product.save();
        res.json(product);
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
}));
// DELETE product (vendor or admin)
router.delete("/:id", auth_1.auth, vendor_1.vendor, async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ msg: "Not authenticated" });
            return;
        }
        const product = await LocalMarketProduct_1.default.findById(req.params.id);
        if (!product) {
            res.status(404).json({ msg: "Product not found" });
            return;
        }
        // Check if user is the vendor of this product or admin
        if (product.vendor.toString() !== req.user.id.toString() &&
            req.user.role !== "admin") {
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
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});
// GET image
router.get("/image/:filename", async (req, res) => {
    try {
        const file = await gfs.find({ filename: req.params.filename }).toArray();
        if (!file || file.length === 0) {
            res.status(404).json({ msg: "No file exists" });
            return;
        }
        const downloadStream = gfs.openDownloadStreamByName(req.params.filename);
        downloadStream.pipe(res);
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});
// DELETE an image (vendor or admin)
router.delete("/image/:filename", auth_1.auth, async (req, res) => {
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
        const product = await LocalMarketProduct_1.default.findOne({
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
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});
// Get vendor's products
router.get("/vendor/products", auth_1.auth, vendor_1.vendor, async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ msg: "Not authenticated" });
            return;
        }
        const products = await LocalMarketProduct_1.default.find({
            vendor: req.user.id,
        }).populate("category");
        res.json(products);
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});
// Update product discount (vendor only)
router.patch("/:id/discount", auth_1.auth, vendor_1.vendor, async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ msg: "Not authenticated" });
            return;
        }
        const { percentage, validFrom, validUntil } = req.body;
        const product = await LocalMarketProduct_1.default.findById(req.params.id);
        if (!product) {
            res.status(404).json({ msg: "Product not found" });
            return;
        }
        if (product.vendor.toString() !== req.user.id.toString()) {
            res.status(403).json({ msg: "Not authorized to update this product" });
            return;
        }
        product.discount = {
            percentage: Number(percentage),
            validFrom: new Date(validFrom),
            validUntil: new Date(validUntil),
            isActive: true,
        };
        await product.save();
        res.json(product);
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});
exports.default = router;
