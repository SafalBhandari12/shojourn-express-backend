const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Create a virtual property "id" that returns the string version of _id
CategorySchema.virtual("id").get(function () {
  return this._id.toHexString();
});

// Ensure virtual fields are serialized.
CategorySchema.set("toJSON", {
  virtuals: true,
});

module.exports = mongoose.model("Category", CategorySchema);