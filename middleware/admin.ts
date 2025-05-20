// Migrated to TypeScript
import { Request, Response, NextFunction } from "express";

export default function admin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ msg: "Access denied. Admins only." });
    return;
  }
  next();
}
