"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vendor = void 0;
const User_1 = __importDefault(require("../models/User"));
const vendor = async (req, res, next) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: "Authentication required" });
            return;
        }
        const user = await User_1.default.findById(req.user.id);
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        if (user.role !== "vendor" && user.role !== "admin") {
            res
                .status(403)
                .json({ error: "Access denied. Vendor privileges required" });
            return;
        }
        next();
    }
    catch (error) {
        console.error("Vendor middleware error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.vendor = vendor;
