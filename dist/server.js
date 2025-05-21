"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Migrated to TypeScript
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("./config/db"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
dotenv_1.default.config();
// Connect to MongoDB
(0, db_1.default)();
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)({ origin: "*" }));
app.use(express_1.default.json());
app.use("/uploads", express_1.default.static(path_1.default.join(__dirname, "uploads")));
// Routes
const auth_1 = __importDefault(require("./routes/auth"));
const category_1 = __importDefault(require("./routes/localmarket/category"));
const localMarket_1 = __importDefault(require("./routes/localmarket/localMarket"));
const orders_1 = __importDefault(require("./routes/orders/orders"));
const users_1 = __importDefault(require("./routes/users/users"));
app.use("/api/auth", auth_1.default);
app.use("/api/categories", category_1.default);
app.use("/api/localmarketproduct", localMarket_1.default);
app.use("/api/orders", orders_1.default);
app.use("/api/users", users_1.default);
// Image handling route
app.use("/api/images", (req, res, next) => {
    req.url = "/image" + req.url;
    (0, localMarket_1.default)(req, res, next);
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal server error" });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
