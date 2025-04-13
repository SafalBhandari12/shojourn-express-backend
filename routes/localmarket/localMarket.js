const express = require("express");
const router = express.Router();
const multer = require("multer");

const LocalMarketProduct = require("../../models/LocalMarketProduct");
const Category = require("../../models/Category");
const auth = require("../../middleware/auth");
const admin = require("../../middleware/admin");

router.use("/category", require("./category"));

// Setup Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Ensure this directory exists
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Helper to generate full URL for a given relative file path
const getFullUrl = (req, filePath) => {
  const baseUrl = req.protocol + "://" + req.get("host");
  // Remove possible leading '/' from filePath if necessary and return the URL
  return `${baseUrl}/${filePath.replace(/^\/+/, "")}`;
};

// @route   GET /api/localmarketproduct
// @desc    Get all local market products (public)
// @access  Public
router.get("/", async (req, res) => {
  try {
    // Populate the category field if needed
    const products = await LocalMarketProduct.find().populate("category");

    // Optionally, update the image fields with the full URL before sending response
    const updatedProducts = products.map((product) => {
      if (product.image) {
        product.image = getFullUrl(req, product.image);
      }
      if (product.multipleImages && product.multipleImages.length > 0) {
        product.multipleImages = product.multipleImages.map((img) =>
          getFullUrl(req, img)
        );
      }
      return product;
    });
    res.json(updatedProducts);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// @route   POST /api/localmarketproduct
// @desc    Create a new local market product (admin only) with image uploads
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
        category,
        rating,
        featured,
      } = req.body;

      // Validate that the category exists.
      const categoryDoc = await Category.findById(category);
      if (!categoryDoc) {
        return res.status(400).json({ msg: "Invalid category provided" });
      }

      // Save single image from "image" field
      let imagePath = "";
      if (req.files && req.files.image && req.files.image.length > 0) {
        imagePath = getFullUrl(req, req.files.image[0].path);
      }

      // Save multiple images from "multipleImages" field
      let multipleImagesPaths = [];
      if (
        req.files &&
        req.files.multipleImages &&
        req.files.multipleImages.length > 0
      ) {
        multipleImagesPaths = req.files.multipleImages.map((file) =>
          getFullUrl(req, file.path)
        );
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
// @desc    Update local market product details (admin only)
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

      // Update product fields
      product.name = name || product.name;
      product.description = description || product.description;
      product.detailedDescription =
        detailedDescription || product.detailedDescription;
      product.price = price || product.price;
      product.origin = origin || product.origin;
      product.usageInstructions =
        usageInstructions || product.usageInstructions;
      product.rating = rating || product.rating;
      product.featured = featured !== undefined ? featured : product.featured;

      // Handle file uploads if provided
      if (req.files) {
        if (req.files.image && req.files.image.length > 0) {
          product.image = getFullUrl(req, req.files.image[0].path);
        }
        if (req.files.multipleImages && req.files.multipleImages.length > 0) {
          product.multipleImages = req.files.multipleImages.map((file) =>
            getFullUrl(req, file.path)
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
// @desc    Delete local market product (admin only)
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