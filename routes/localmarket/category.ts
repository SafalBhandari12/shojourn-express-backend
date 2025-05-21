// Migrated to TypeScript
import { Router, Request, Response, RequestHandler } from "express";
import Category from "../../models/Category";
import { auth } from "../../middleware/auth";
import { admin } from "../../middleware/admin";
import { RequestWithFiles } from "../../types/express";

const router = Router();

// Get all categories
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ error: "Error fetching categories" });
  }
});

// Create new category (admin only)
router.post(
  "/",
  auth,
  admin,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const { name, description } = req.body;

      if (!name) {
        res.status(400).json({ error: "Category name is required" });
        return;
      }

      let category = await Category.findOne({ name });
      if (category) {
        res.status(400).json({ error: "Category already exists" });
        return;
      }

      category = new Category({ name, description });
      const savedCategory = await category.save();
      res.status(201).json(savedCategory);
    } catch (error) {
      console.error("Create category error:", error);
      res.status(500).json({ error: "Error creating category" });
    }
  }
);

// Update category (admin only)
router.put(
  "/:id",
  auth,
  admin,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const { name, description } = req.body;

      if (!name) {
        res.status(400).json({ error: "Category name is required" });
        return;
      }

      let category = await Category.findById(req.params.id);
      if (!category) {
        res.status(404).json({ error: "Category not found" });
        return;
      }

      // Check if new name already exists for a different category
      const existingCategory = await Category.findOne({
        name,
        _id: { $ne: req.params.id },
      });

      if (existingCategory) {
        res.status(400).json({ error: "Category name already exists" });
        return;
      }

      category.name = name;
      if (description !== undefined) {
        category.description = description;
      }

      const updatedCategory = await category.save();
      res.json(updatedCategory);
    } catch (error) {
      console.error("Update category error:", error);
      res.status(500).json({ error: "Error updating category" });
    }
  }
);

// Delete category (admin only)
router.delete(
  "/:id",
  auth,
  admin,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const category = await Category.findById(req.params.id);
      if (!category) {
        res.status(404).json({ error: "Category not found" });
        return;
      }

      // Check if category is in use
      const productsCount = await Category.countDocuments({
        category: req.params.id,
      });
      if (productsCount > 0) {
        res.status(400).json({
          error: "Cannot delete category that is in use by products",
        });
        return;
      }

      await category.deleteOne();
      res.json({ message: "Category removed successfully" });
    } catch (error) {
      console.error("Delete category error:", error);
      res.status(500).json({ error: "Error deleting category" });
    }
  }
);

export default router;
