const mongoose = require("mongoose");

const LocalMarketProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: String,
    detailedDescription: String,
    // Store price as a Number (formatted on the API response)
    price: {
      type: Number,
      required: true,
    },
    // Single image path (will be stored as a relative path)
    image: String,
    // For multiple images (if applicable)
    multipleImages: [String],
    origin: String,
    usageInstructions: String,
    careInstructions: String,
    nutritionalInfo: String,
    // Reference to the Category model
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    rating: Number,
    featured: Boolean,
  },
  { timestamps: true }
);

// Create a virtual property "id" that returns the string version of _id
LocalMarketProductSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

// Ensure virtual fields are serialized.
LocalMarketProductSchema.set("toJSON", {
  virtuals: true,
});

module.exports = mongoose.model("LocalMarketProduct", LocalMarketProductSchema);