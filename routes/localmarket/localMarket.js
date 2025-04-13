const express = require("express");
const router = express.Router();
const multer = require("multer");

const LocalMarketProduct = require("../../models/LocalMarketProduct");
const Category = require("../../models/Category");
const auth = require("../../middleware/auth");
const admin = require("../../middleware/admin");

// Setup Multer storage configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Ensure this directory exists
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Helper to generate a full URL from a relative file path (normalizing backslashes)
const getFullUrl = (req, filePath) => {
  const baseUrl = req.protocol + "://" + req.get("host");
  // Normalize any backslashes to forward slashes and remove extra leading slashes
  const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${baseUrl}/${normalizedPath}`;
};

// Helper to format the price (assumes price is stored as a Number)
const formatPrice = (price) => {
  return (
    "₹" +
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(price)
  );
};

// @route   GET /api/localmarketproduct
// @desc    Get all local market products with complete image URLs (public)
// @access  Public
router.get("/", async (req, res) => {
  try {
    // Populate category field to retrieve category details
    const products = await LocalMarketProduct.find().populate("category");

    const transformedProducts = products.map((product) => ({
      id: product._id,
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
          ? product.multipleImages.map((img) => getFullUrl(req, img))
          : undefined,
      category:
        product.category && product.category.name
          ? product.category.name
          : product.category,
      rating: product.rating,
      featured: product.featured,
    }));

    res.json(transformedProducts);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// @route   POST /api/localmarketproduct
// @desc    Create a new local market product with image uploads (admin only)
// @access  Private (admin)
router.post(
  "/",
  auth,
  admin,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "multipleImages", maxCount: 5 },
  ]),
  async (req, res) => {
    try {
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
      } = req.body;

      // Validate that the category exists.
      const categoryDoc = await Category.findById(category);
      if (!categoryDoc) {
        return res.status(400).json({ msg: "Invalid category provided" });
      }

      // Store the relative file path (do not prepend full URL here)
      let imagePath = "";
      if (req.files && req.files.image && req.files.image.length > 0) {
        imagePath = req.files.image[0].path;
      }

      // Save relative paths for multiple images
      let multipleImagesPaths = [];
      if (
        req.files &&
        req.files.multipleImages &&
        req.files.multipleImages.length > 0
      ) {
        multipleImagesPaths = req.files.multipleImages.map((file) => file.path);
      }

      const newProduct = new LocalMarketProduct({
        name,
        description,
        detailedDescription,
        price,
        image: imagePath,
        multipleImages: multipleImagesPaths,
        origin,
        usageInstructions,
        careInstructions,
        nutritionalInfo,
        category,
        rating,
        featured,
      });

      const savedProduct = await newProduct.save();
      res.json(savedProduct);
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }
);

// @route   PUT /api/localmarketproduct/:id
// @desc    Update a local market product with image uploads (admin only)
// @access  Private (admin)
router.put(
  "/:id",
  auth,
  admin,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "multipleImages", maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      let product = await LocalMarketProduct.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ msg: "Product not found" });
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
      } = req.body;

      // If a category is provided, validate that it exists.
      if (category) {
        const categoryDoc = await Category.findById(category);
        if (!categoryDoc) {
          return res.status(400).json({ msg: "Invalid category provided" });
        }
        product.category = category;
      }

      // Update product fields with new values if provided
      product.name = name || product.name;
      product.description = description || product.description;
      product.detailedDescription =
        detailedDescription || product.detailedDescription;
      product.price = price || product.price;
      product.origin = origin || product.origin;
      product.usageInstructions =
        usageInstructions || product.usageInstructions;
      product.careInstructions = careInstructions || product.careInstructions;
      product.nutritionalInfo = nutritionalInfo || product.nutritionalInfo;
      product.rating = rating || product.rating;
      product.featured = featured !== undefined ? featured : product.featured;

      // Handle file uploads (store relative file paths)
      if (req.files) {
        if (req.files.image && req.files.image.length > 0) {
          product.image = req.files.image[0].path;
        }
        if (req.files.multipleImages && req.files.multipleImages.length > 0) {
          product.multipleImages = req.files.multipleImages.map(
            (file) => file.path
          );
        }
      }

      await product.save();
      res.json(product);
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }
);

// @route   DELETE /api/localmarketproduct/:id
// @desc    Delete a local market product (admin only)
// @access  Private (admin)
router.delete("/:id", auth, admin, async (req, res) => {
  try {
    let product = await LocalMarketProduct.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ msg: "Product not found" });
    }
    await product.remove();
    res.json({ msg: "Product removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;