import express, { RequestHandler } from "express";
import { auth } from "../../middleware/auth";
import { admin } from "../../middleware/admin";
import Category from "../../models/Category";

const router = express.Router();

// Create category (admin only)
router.post("/", [auth, admin] as RequestHandler[], async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = new Category({ name, description });
    await category.save();
    res.status(201).json(category);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Get all categories
router.get("/", (async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}) as RequestHandler);

// Get single category
router.get("/:id", (async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json(category);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}) as RequestHandler);

// Update category (admin only)
router.put("/:id", [auth, admin] as RequestHandler[], async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true }
    );
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json(category);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Delete category (admin only)
router.delete("/:id", [auth, admin] as RequestHandler[], async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json({ message: "Category deleted successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
