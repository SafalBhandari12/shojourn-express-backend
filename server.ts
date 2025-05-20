// Migrated to TypeScript
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import connectDB from "./config/db";
import path from "path";
import cors from "cors";

dotenv.config();

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

import authRoutes from "./routes/auth";
import categoryRoutes from "./routes/localmarket/category";
import localMarketProductRoutes from "./routes/localmarket/localMarket";

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/localmarketproduct", localMarketProductRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
