const mongoose = require("mongoose");

const LocalMarketProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: String,
    detailedDescription: String,
    // Note: While your sample price is "₹1,500", we expect a numeric price.
    // Ensure you parse the price appropriately before saving.
    price: {
      type: Number,
      required: true,
    },
    // Single image path
    image: String,
    // New field to store multiple image paths (e.g., from Multer)
    multipleImages: [String],
    origin: String,
    usageInstructions: String,
    // Now a reference to the Category model
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    rating: Number,
    featured: Boolean,
  },
  { timestamps: true }
);

module.exports = mongoose.model("LocalMarketProduct", LocalMarketProductSchema);