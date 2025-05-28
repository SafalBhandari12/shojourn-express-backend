import {
  Router,
  Request,
  Response,
  RequestHandler,
  NextFunction,
} from "express";
import mongoose from "mongoose";
import Order, { IOrder, OrderStatus } from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import LocalMarketProduct from "../../../models/LocalMarketProduct";
import { auth } from "../../../middleware/auth";
import vendorMiddleware from "../../../middleware/vendorMiddleware";
import { admin } from "../../../middleware/admin";
import { RequestWithFiles } from "../../../types/express";

const router = Router();

interface OrderRequestBody {
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  shippingAddress: string;
  paymentMethod: string;
  status?: OrderStatus;
}

interface OrderItemType {
  product: mongoose.Types.ObjectId;
  quantity: number;
  price: number;
  vendor: mongoose.Types.ObjectId;
}

// Add interface for populated product
interface PopulatedProduct {
  _id: mongoose.Types.ObjectId;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: mongoose.Types.ObjectId;
  vendor: mongoose.Types.ObjectId;
  discount: {
    isActive: boolean;
    percentage: number;
    validFrom: Date;
    validUntil: Date;
  };
  boughtBy: number;
  rating: number;
  ratings?: Array<{
    user: mongoose.Types.ObjectId;
    value: number;
  }>;
}

// Helper function to type check middleware
const withAuth = (handler: RequestHandler): RequestHandler => {
  return async (req: RequestWithFiles, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ msg: "Not authenticated" });
      return;
    }
    return handler(req, res, next);
  };
};

// Utility function to check for plain object (not ObjectId or serialized ObjectId)
function isPlainObject(obj: any) {
  return (
    obj &&
    typeof obj === "object" &&
    !("generationTime" in obj && Object.keys(obj).length === 1) &&
    !(obj instanceof mongoose.Types.ObjectId)
  );
}

// Utility function to check for a real product object (not ObjectId or serialized ObjectId)
function isProductWithRatings(obj: any): obj is { ratings: any[] } {
  return (
    obj &&
    typeof obj === "object" &&
    Array.isArray(obj.ratings) &&
    Object.keys(obj).length > 1 // must have more than just generationTime
  );
}

// Create new order
router.post(
  "/",
  auth,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const { items, shippingAddress, paymentMethod } =
        req.body as OrderRequestBody;

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
      const orderItems: OrderItemType[] = [];

      for (const item of items) {
        const product = await LocalMarketProduct.findById(item.productId);
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
        if (
          product.discount.isActive &&
          new Date() >= product.discount.validFrom &&
          new Date() <= product.discount.validUntil
        ) {
          finalPrice = product.price * (1 - product.discount.percentage / 100);
        }

        orderItems.push({
          product: new mongoose.Types.ObjectId(product._id),
          quantity: item.quantity,
          price: finalPrice,
          vendor: new mongoose.Types.ObjectId(product.vendor),
        });

        totalAmount += finalPrice * item.quantity;

        // Update product stock
        product.stock -= item.quantity;
        product.boughtBy += item.quantity;
        await product.save();
      }

      const order = new Order({
        user: req.user?.id,
        items: orderItems,
        totalAmount,
        shippingAddress,
        paymentMethod,
      });

      await order.save();
      res.status(201).json(order);
    } catch (error) {
      console.error("Create order error:", error);
      res.status(500).json({ error: "Error creating order" });
    }
  }
);

// Get user's orders
router.get(
  "/my-orders",
  auth,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const orders = await Order.find({ user: req.user?.id })
        .populate({
          path: "items.product",
          model: "LocalMarketProduct",
          select:
            "name description price stock category vendor discount boughtBy ratings rating",
          populate: {
            path: "ratings.user",
            model: "User",
            select: "_id",
          },
        })
        .lean();

      const ordersWithRatings = await Promise.all(
        orders.map(async (order) => {
          const userId = req.user?.id;
          const itemsWithRatings = await Promise.all(
            order.items.map(async (item) => {
              let userRating: number | null = null;

              // Get the product with its ratings
              const product = await LocalMarketProduct.findById(item.product)
                .populate("ratings.user", "_id")
                .lean();

              if (product && Array.isArray(product.ratings) && userId) {
                // Defensive: handle both ObjectId and populated user
                const userRatingObj = product.ratings.find((r) => {
                  if (r.user && typeof r.user === "object") {
                    // Populated user object
                    if ("_id" in r.user && r.user._id) {
                      return (
                        (
                          r.user._id as { toString: () => string }
                        ).toString() === userId.toString()
                      );
                    }
                    // Mongoose ObjectId
                    if ("toString" in r.user) {
                      return (
                        (r.user as { toString: () => string }).toString() ===
                        userId.toString()
                      );
                    }
                  }
                  // If r.user is a string or undefined
                  return (r.user as any)?.toString() === userId.toString();
                });
                userRating = userRatingObj ? userRatingObj.value : null;
              }

              // Create a clean product object
              const cleanProduct = product
                ? {
                    _id: product._id,
                    name: product.name,
                    description: product.description,
                    price: product.price,
                    stock: product.stock,
                    category: product.category,
                    vendor: product.vendor,
                    discount: product.discount,
                    boughtBy: product.boughtBy,
                    rating: product.rating,
                  }
                : null;

              return {
                orderId: order._id,
                product: cleanProduct,
                quantity: item.quantity,
                price: item.price,
                vendor: item.vendor,
                userRating,
                status: order.status,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                shippingAddress: order.shippingAddress,
                paymentMethod: order.paymentMethod,
                totalAmount: order.totalAmount,
              };
            })
          );

          return itemsWithRatings;
        })
      );

      // Flatten the array of arrays into a single array of items
      const flattenedOrders = ordersWithRatings.flat();
      res.json(flattenedOrders);
    } catch (error) {
      console.error("Get user orders error:", error);
      res.status(500).json({ error: "Error fetching orders" });
    }
  }
);

// Get vendor's orders
router.get(
  "/vendor",
  [auth, vendorMiddleware] as RequestHandler[],
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const orders = await Order.find({ "items.vendor": req.user?.id })
        .populate("user", "name mobile")
        .populate("items.product")
        .sort({ createdAt: -1 });
      res.json(orders);
    } catch (error) {
      console.error("Get vendor orders error:", error);
      res.status(500).json({ error: "Error fetching orders" });
    }
  }
);

// Get all orders (admin only)
router.get(
  "/all",
  auth,
  admin,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      const orders = await Order.find()
        .populate("user", "name mobile")
        .populate("items.product")
        .sort({ createdAt: -1 });
      res.json(orders);
    } catch (error) {
      console.error("Get all orders error:", error);
      res.status(500).json({ error: "Error fetching orders" });
    }
  }
);

// Update order status (vendor only)
router.patch(
  "/:id/status",
  [auth, vendorMiddleware] as RequestHandler[],
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "User ID not found" });
        return;
      }

      const { status } = req.body as OrderRequestBody;
      if (!status) {
        res.status(400).json({ error: "Status is required" });
        return;
      }

      const order = await Order.findById(req.params.id);

      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      // Check if the vendor is associated with any items in the order
      const vendorId = new mongoose.Types.ObjectId(req.user.id);
      const isVendorOfOrder = order.items.some(
        (item) => item.vendor.toString() === vendorId.toString()
      );

      if (!isVendorOfOrder) {
        res.status(403).json({
          error: "Not authorized. You are not the vendor of this order",
        });
        return;
      }

      order.status = status;
      await order.save();
      res.json(order);
    } catch (error) {
      console.error("Update order status error:", error);
      res.status(500).json({ error: "Error updating order status" });
    }
  }
);

// Cancel order (user only)
router.patch(
  "/:id/cancel",
  auth,
  async (req: RequestWithFiles, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "User ID not found" });
        return;
      }

      const order = await Order.findById(req.params.id);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      const userId = new mongoose.Types.ObjectId(req.user.id);
      if (order.user.toString() !== userId.toString()) {
        res.status(403).json({ error: "Not authorized to cancel this order" });
        return;
      }

      if (order.status !== "pending") {
        res
          .status(400)
          .json({ error: "Cannot cancel order in current status" });
        return;
      }

      // Restore product stock
      for (const item of order.items) {
        const product = await LocalMarketProduct.findById(item.product);
        if (product) {
          product.stock += item.quantity;
          await product.save();
        }
      }

      order.status = "cancelled";
      await order.save();
      res.json(order);
    } catch (error) {
      console.error("Cancel order error:", error);
      res.status(500).json({ error: "Error cancelling order" });
    }
  }
);

export default router;
