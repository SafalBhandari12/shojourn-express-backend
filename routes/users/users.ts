import {
  Router,
  Request,
  Response,
  RequestHandler,
  NextFunction,
} from "express";
import mongoose from "mongoose";
import User from "../../models/User";
import { auth } from "../../middleware/auth";
import { admin } from "../../middleware/admin";

const router = Router();

interface UserRequestBody {
  role?: "client" | "vendor" | "admin";
}

// Helper function to type check middleware
const withAuth = (handler: RequestHandler): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ msg: "Not authenticated" });
      return;
    }
    return handler(req, res, next);
  };
};

// Get all users (admin only)
router.get(
  "/",
  auth as RequestHandler,
  admin as RequestHandler,
  withAuth(async (req: Request, res: Response) => {
    try {
      const users = await User.find().select("-password");
      res.json(users);
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  })
);

// Get user by ID (admin only)
router.get(
  "/:id",
  auth as RequestHandler,
  admin as RequestHandler,
  withAuth(async (req: Request, res: Response) => {
    try {
      const user = await User.findById(req.params.id).select("-password");
      if (!user) {
        res.status(404).json({ msg: "User not found" });
        return;
      }
      res.json(user);
    } catch (err: any) {
      console.error(err.message);
      if (err.kind === "ObjectId") {
        res.status(404).json({ msg: "User not found" });
        return;
      }
      res.status(500).send("Server error");
    }
  })
);

// Update user role (admin only)
router.patch(
  "/:id/role",
  auth as RequestHandler,
  admin as RequestHandler,
  withAuth(async (req: Request, res: Response) => {
    try {
      const { role } = req.body as UserRequestBody;

      if (!role || !["client", "vendor", "admin"].includes(role)) {
        res.status(400).json({ msg: "Invalid role" });
        return;
      }

      const user = await User.findById(req.params.id);
      if (!user) {
        res.status(404).json({ msg: "User not found" });
        return;
      }

      // Prevent changing the role of the last admin
      if (user.role === "admin" && role !== "admin") {
        const adminCount = await User.countDocuments({ role: "admin" });
        if (adminCount <= 1) {
          res.status(400).json({ msg: "Cannot remove the last admin" });
          return;
        }
      }

      user.role = role;
      await user.save();

      res.json({ msg: "User role updated successfully", user });
    } catch (err: any) {
      console.error(err.message);
      if (err.kind === "ObjectId") {
        res.status(404).json({ msg: "User not found" });
        return;
      }
      res.status(500).send("Server error");
    }
  })
);

// Delete user (admin only)
router.delete(
  "/:id",
  auth as RequestHandler,
  admin as RequestHandler,
  withAuth(async (req: Request, res: Response) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        res.status(404).json({ msg: "User not found" });
        return;
      }

      // Prevent deleting the last admin
      if (user.role === "admin") {
        const adminCount = await User.countDocuments({ role: "admin" });
        if (adminCount <= 1) {
          res.status(400).json({ msg: "Cannot delete the last admin" });
          return;
        }
      }

      await user.deleteOne();
      res.json({ msg: "User deleted successfully" });
    } catch (err: any) {
      console.error(err.message);
      if (err.kind === "ObjectId") {
        res.status(404).json({ msg: "User not found" });
        return;
      }
      res.status(500).send("Server error");
    }
  })
);

// Get current user's information
router.get(
  "/me",
  auth as RequestHandler,
  withAuth(async (req: Request, res: Response) => {
    try {
      const user = await User.findById(req.user?.id).select("-password");
      if (!user) {
        res.status(404).json({ msg: "User not found" });
        return;
      }
      res.json(user);
    } catch (err: any) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  })
);

export default router;
