"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Migrated to TypeScript
const express_1 = require("express");
const Category_1 = __importDefault(require("../../models/Category"));
const auth_1 = require("../../middleware/auth");
const admin_1 = require("../../middleware/admin");
const router = (0, express_1.Router)();
// Get all categories
router.get("/", async (req, res) => {
    try {
        const categories = await Category_1.default.find();
        res.json(categories);
    }
    catch (error) {
        console.error("Get categories error:", error);
        res.status(500).json({ error: "Error fetching categories" });
    }
});
// Create new category (admin only)
router.post("/", auth_1.auth, admin_1.admin, async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) {
            res.status(400).json({ error: "Category name is required" });
            return;
        }
        let category = await Category_1.default.findOne({ name });
        if (category) {
            res.status(400).json({ error: "Category already exists" });
            return;
        }
        category = new Category_1.default({ name, description });
        const savedCategory = await category.save();
        res.status(201).json(savedCategory);
    }
    catch (error) {
        console.error("Create category error:", error);
        res.status(500).json({ error: "Error creating category" });
    }
});
// Update category (admin only)
router.put("/:id", auth_1.auth, admin_1.admin, async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) {
            res.status(400).json({ error: "Category name is required" });
            return;
        }
        let category = await Category_1.default.findById(req.params.id);
        if (!category) {
            res.status(404).json({ error: "Category not found" });
            return;
        }
        // Check if new name already exists for a different category
        const existingCategory = await Category_1.default.findOne({
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
    }
    catch (error) {
        console.error("Update category error:", error);
        res.status(500).json({ error: "Error updating category" });
    }
});
// Delete category (admin only)
router.delete("/:id", auth_1.auth, admin_1.admin, async (req, res) => {
    try {
        const category = await Category_1.default.findById(req.params.id);
        if (!category) {
            res.status(404).json({ error: "Category not found" });
            return;
        }
        // Check if category is in use
        const productsCount = await Category_1.default.countDocuments({
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
    }
    catch (error) {
        console.error("Delete category error:", error);
        res.status(500).json({ error: "Error deleting category" });
    }
});
exports.default = router;
