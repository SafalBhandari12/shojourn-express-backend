// Migrated to TypeScript
import { Router, Request, Response } from "express";
import Category from "../../models/Category";
import auth from "../../middleware/auth";
import admin from "../../middleware/admin";

const router = Router();

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

router.post(
  "/",
  auth,
  admin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, description } = req.body;
      let category = await Category.findOne({ name });
      if (category) {
        res.status(400).json({ msg: "Category already exists" });
        return;
      }
      category = new Category({ name, description });
      const savedCategory = await category.save();
      res.json(savedCategory);
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }
);

router.put(
  "/:id",
  auth,
  admin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      let category = await Category.findById(req.params.id);
      if (!category) {
        res.status(404).json({ msg: "Category not found" });
        return;
      }
      const { name, description } = req.body;
      category.name = name || category.name;
      category.description = description || category.description;
      const updatedCategory = await category.save();
      res.json(updatedCategory);
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }
);

router.delete(
  "/:id",
  auth,
  admin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      let category = await Category.findById(req.params.id);
      if (!category) {
        res.status(404).json({ msg: "Category not found" });
        return;
      }
      await category.remove();
      res.json({ msg: "Category removed" });
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  }
);

export default router;
