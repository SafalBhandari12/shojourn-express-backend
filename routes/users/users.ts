import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import User, { IUser } from "../../models/User";
import { auth } from "../../middleware/auth";
import { admin } from "../../middleware/admin";
import { RequestWithFiles } from "../../types/express";

const router = Router();

interface UserRequestBody {
  role?: "user" | "vendor" | "admin";
}

// Get current user's information
router.get(
  "/me",
  auth,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const user = await User.findById(req.user?.id).select("-password");
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json(user);
    } catch (error) {
      console.error("Get current user error:", error);
      res.status(500).json({ error: "Error fetching user information" });
    }
  }
);

// Get all users (admin only)
router.get(
  "/",
  auth,
  admin,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const users = await User.find().select("-password");
      res.json(users);
    } catch (error) {
      console.error("Get all users error:", error);
      res.status(500).json({ error: "Error fetching users" });
    }
  }
);

// Get user by ID (admin only)
router.get(
  "/:id",
  auth,
  admin,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const user = await User.findById(req.params.id).select("-password");
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json(user);
    } catch (error) {
      console.error("Get user by ID error:", error);
      if (error instanceof mongoose.Error.CastError) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.status(500).json({ error: "Error fetching user" });
    }
  }
);

// Update user role (admin only)
router.patch(
  "/:id/role",
  auth,
  admin,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const { role } = req.body as UserRequestBody;

      if (!role || !["user", "vendor", "admin"].includes(role)) {
        res.status(400).json({ error: "Invalid role" });
        return;
      }

      const user = await User.findById(req.params.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Prevent changing the role of the last admin
      if (user.role === "admin" && role !== "admin") {
        const adminCount = await User.countDocuments({ role: "admin" });
        if (adminCount <= 1) {
          res.status(400).json({ error: "Cannot remove the last admin" });
          return;
        }
      }

      user.role = role;
      await user.save();

      res.json({ message: "User role updated successfully", user });
    } catch (error) {
      console.error("Update user role error:", error);
      if (error instanceof mongoose.Error.CastError) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.status(500).json({ error: "Error updating user role" });
    }
  }
);

// Delete user (admin only)
router.delete(
  "/:id",
  auth,
  admin,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Prevent deleting the last admin
      if (user.role === "admin") {
        const adminCount = await User.countDocuments({ role: "admin" });
        if (adminCount <= 1) {
          res.status(400).json({ error: "Cannot delete the last admin" });
          return;
        }
      }

      await user.deleteOne();
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      if (error instanceof mongoose.Error.CastError) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.status(500).json({ error: "Error deleting user" });
    }
  }
);

export default router;
