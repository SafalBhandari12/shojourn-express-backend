"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const User_1 = __importDefault(require("../../models/User"));
const auth_1 = require("../../middleware/auth");
const admin_1 = require("../../middleware/admin");
const router = (0, express_1.Router)();
// Helper function to type check middleware
const withAuth = (handler) => {
    return async (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ msg: "Not authenticated" });
            return;
        }
        return handler(req, res, next);
    };
};
// Get all users (admin only)
router.get("/", auth_1.auth, admin_1.admin, withAuth(async (req, res) => {
    try {
        const users = await User_1.default.find().select("-password");
        res.json(users);
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
}));
// Get user by ID (admin only)
router.get("/:id", auth_1.auth, admin_1.admin, withAuth(async (req, res) => {
    try {
        const user = await User_1.default.findById(req.params.id).select("-password");
        if (!user) {
            res.status(404).json({ msg: "User not found" });
            return;
        }
        res.json(user);
    }
    catch (err) {
        console.error(err.message);
        if (err.kind === "ObjectId") {
            res.status(404).json({ msg: "User not found" });
            return;
        }
        res.status(500).send("Server error");
    }
}));
// Update user role (admin only)
router.patch("/:id/role", auth_1.auth, admin_1.admin, withAuth(async (req, res) => {
    try {
        const { role } = req.body;
        if (!role || !["client", "vendor", "admin"].includes(role)) {
            res.status(400).json({ msg: "Invalid role" });
            return;
        }
        const user = await User_1.default.findById(req.params.id);
        if (!user) {
            res.status(404).json({ msg: "User not found" });
            return;
        }
        // Prevent changing the role of the last admin
        if (user.role === "admin" && role !== "admin") {
            const adminCount = await User_1.default.countDocuments({ role: "admin" });
            if (adminCount <= 1) {
                res.status(400).json({ msg: "Cannot remove the last admin" });
                return;
            }
        }
        user.role = role;
        await user.save();
        res.json({ msg: "User role updated successfully", user });
    }
    catch (err) {
        console.error(err.message);
        if (err.kind === "ObjectId") {
            res.status(404).json({ msg: "User not found" });
            return;
        }
        res.status(500).send("Server error");
    }
}));
// Delete user (admin only)
router.delete("/:id", auth_1.auth, admin_1.admin, withAuth(async (req, res) => {
    try {
        const user = await User_1.default.findById(req.params.id);
        if (!user) {
            res.status(404).json({ msg: "User not found" });
            return;
        }
        // Prevent deleting the last admin
        if (user.role === "admin") {
            const adminCount = await User_1.default.countDocuments({ role: "admin" });
            if (adminCount <= 1) {
                res.status(400).json({ msg: "Cannot delete the last admin" });
                return;
            }
        }
        await user.deleteOne();
        res.json({ msg: "User deleted successfully" });
    }
    catch (err) {
        console.error(err.message);
        if (err.kind === "ObjectId") {
            res.status(404).json({ msg: "User not found" });
            return;
        }
        res.status(500).send("Server error");
    }
}));
exports.default = router;
