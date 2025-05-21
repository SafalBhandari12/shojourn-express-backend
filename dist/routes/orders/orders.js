"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Order_1 = __importDefault(require("../../models/Order"));
const OrderItem_1 = __importDefault(require("../../models/OrderItem"));
const LocalMarketProduct_1 = __importDefault(require("../../models/LocalMarketProduct"));
const auth_1 = require("../../middleware/auth");
const vendor_1 = require("../../middleware/vendor");
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
// Create new order
router.post("/", auth_1.auth, async (req, res) => {
    try {
        const { items, shippingAddress, paymentMethod } = req.body;
        if (!items || !Array.isArray(items) || items.length === 0) {
            res.status(400).json({ error: "Order items are required" });
            return;
        }
        if (!shippingAddress || !paymentMethod) {
            res
                .status(400)
                .json({ error: "Shipping address and payment method are required" });
            return;
        }
        // Calculate total amount and validate products
        let totalAmount = 0;
        const orderItems = [];
        for (const item of items) {
            const product = await LocalMarketProduct_1.default.findById(item.productId);
            if (!product) {
                res
                    .status(404)
                    .json({ error: `Product ${item.productId} not found` });
                return;
            }
            if (product.stock < item.quantity) {
                res
                    .status(400)
                    .json({ error: `Insufficient stock for ${product.name}` });
                return;
            }
            // Calculate price with discount if applicable
            let finalPrice = product.price;
            if (product.discount.isActive &&
                new Date() >= product.discount.validFrom &&
                new Date() <= product.discount.validUntil) {
                finalPrice = product.price * (1 - product.discount.percentage / 100);
            }
            orderItems.push({
                product: product._id,
                quantity: item.quantity,
                price: product.price,
                vendor: product.vendor,
            });
            totalAmount += finalPrice * item.quantity;
            // Update product stock
            product.stock -= item.quantity;
            await product.save();
        }
        const order = new Order_1.default({
            user: req.user?.id,
            items: orderItems,
            totalAmount,
            shippingAddress,
            paymentMethod,
        });
        await order.save();
        res.status(201).json(order);
    }
    catch (error) {
        console.error("Create order error:", error);
        res.status(500).json({ error: "Error creating order" });
    }
});
// Get user's orders
router.get("/my-orders", auth_1.auth, async (req, res) => {
    try {
        const orders = await Order_1.default.find({ user: req.user?.id })
            .populate("items.product")
            .sort({ createdAt: -1 });
        res.json(orders);
    }
    catch (error) {
        console.error("Get user orders error:", error);
        res.status(500).json({ error: "Error fetching orders" });
    }
});
// Get vendor's orders
router.get("/vendor", auth_1.auth, vendor_1.vendor, async (req, res) => {
    try {
        const orders = await Order_1.default.find({ "items.vendor": req.user?.id })
            .populate("user", "name mobile")
            .populate("items.product")
            .sort({ createdAt: -1 });
        res.json(orders);
    }
    catch (error) {
        console.error("Get vendor orders error:", error);
        res.status(500).json({ error: "Error fetching orders" });
    }
});
// Get all orders (admin only)
router.get("/all", auth_1.auth, admin_1.admin, async (req, res) => {
    try {
        const orders = await Order_1.default.find()
            .populate("user", "name mobile")
            .populate("items.product")
            .sort({ createdAt: -1 });
        res.json(orders);
    }
    catch (error) {
        console.error("Get all orders error:", error);
        res.status(500).json({ error: "Error fetching orders" });
    }
});
// Update order status (vendor only)
router.patch("/:id/status", auth_1.auth, vendor_1.vendor, async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) {
            res.status(400).json({ error: "Status is required" });
            return;
        }
        const order = await Order_1.default.findById(req.params.id);
        if (!order) {
            res.status(404).json({ error: "Order not found" });
            return;
        }
        // Check if the vendor is associated with any items in the order
        const isVendorOfOrder = order.items.some((item) => item.vendor.toString() === req.user?.id);
        if (!isVendorOfOrder) {
            res.status(403).json({
                error: "Not authorized. You are not the vendor of this order",
            });
            return;
        }
        order.status = status;
        await order.save();
        res.json(order);
    }
    catch (error) {
        console.error("Update order status error:", error);
        res.status(500).json({ error: "Error updating order status" });
    }
});
// Cancel order (user only)
router.patch("/:id/cancel", auth_1.auth, withAuth(async (req, res) => {
    try {
        const order = await Order_1.default.findById(req.params.id);
        if (!order) {
            res.status(404).json({ msg: "Order not found" });
            return;
        }
        if (order.user.toString() !== req.user?.id) {
            res.status(403).json({ msg: "Not authorized" });
            return;
        }
        if (order.status !== "pending") {
            res.status(400).json({ msg: "Cannot cancel order in current status" });
            return;
        }
        // Restore product stock
        const orderItems = await OrderItem_1.default.find({ order: order._id });
        for (const item of orderItems) {
            const product = await LocalMarketProduct_1.default.findById(item.product);
            if (product) {
                product.stock += item.quantity;
                await product.save();
            }
        }
        order.status = "cancelled";
        await order.save();
        res.json(order);
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
}));
exports.default = router;
