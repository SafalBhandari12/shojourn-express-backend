// Migrated to TypeScript
import { Request, Response, NextFunction } from "express";
import { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";

interface CustomJwtPayload extends JwtPayload {
  user: {
    id: string;
    role: "client" | "admin";
  };
}

export default function auth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.header("x-auth-token");
  if (!token) {
    res.status(401).json({ msg: "No token, authorization denied" });
    return;
  }
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as CustomJwtPayload;
    req.user = decoded.user;
    next();
  } catch (err) {
    console.log(err);
    res.status(401).json({ msg: "Token is not valid" });
  }
}
