const express = require("express");
const router = express.Router();
const Category = require("../../models/Category");
const auth = require("../../middleware/auth");
const admin = require("../../middleware/admin");

// @route   GET /api/categories
// @desc    Get all categories (public)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// @route   POST /api/categories
// @desc    Create a new category (admin only)
// @access  Private (admin)
router.post("/", auth, admin, async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if category already exists
    let category = await Category.findOne({ name });
    if (category) {
      return res.status(400).json({ msg: "Category already exists" });
    }

    category = new Category({ name, description });
    const savedCategory = await category.save();
    res.json(savedCategory);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// @route   PUT /api/categories/:id
// @desc    Update category details (admin only)
// @access  Private (admin)
router.put("/:id", auth, admin, async (req, res) => {
  try {
    let category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ msg: "Category not found" });
    }

    const { name, description } = req.body;
    category.name = name || category.name;
    category.description = description || category.description;

    const updatedCategory = await category.save();
    res.json(updatedCategory);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete a category (admin only)
// @access  Private (admin)
router.delete("/:id", auth, admin, async (req, res) => {
  try {
    let category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ msg: "Category not found" });
    }
    await category.remove();
    res.json({ msg: "Category removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
