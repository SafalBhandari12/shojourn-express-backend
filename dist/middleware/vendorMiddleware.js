"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const User_1 = __importDefault(require("../models/User"));
const vendorMiddleware = async (req, res, next) => {
    try {
        if (!req.user) {
            res.status(401).json({ msg: "No token, authorization denied" });
            return;
        }
        const user = await User_1.default.findById(req.user.id);
        if (!user) {
            res.status(401).json({ msg: "User not found" });
            return;
        }
        if (user.role !== "vendor" && user.role !== "admin") {
            res
                .status(403)
                .json({ msg: "Access denied. Vendor privileges required." });
            return;
        }
        next();
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
};
exports.default = vendorMiddleware;
