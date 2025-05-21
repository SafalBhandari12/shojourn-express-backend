// Migrated to TypeScript
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import connectDB from "./config/db";
import path from "path";
import cors from "cors";

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
import authRoutes from "./routes/auth";
import categoryRoutes from "./routes/localmarket/category";
import localMarketProductRoutes from "./routes/localmarket/localMarket";
import orderRoutes from "./routes/orders/orders";
import userRoutes from "./routes/users/users";

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/localmarketproduct", localMarketProductRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/users", userRoutes);

// Image handling route
app.use("/api/images", (req: Request, res: Response, next: NextFunction) => {
  req.url = "/image" + req.url;
  localMarketProductRoutes(req, res, next);
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
