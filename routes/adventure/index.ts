import express, { RequestHandler, Response, NextFunction } from "express";
import { auth } from "../../middleware/auth";
import adventurerMiddleware from "../../middleware/adventurerMiddleware";
import { admin } from "../../middleware/admin";
import {
  createAdventure,
  updateAdventure,
  deleteAdventure,
  getAdventure,
  getAllAdventures,
  getAdventurerAdventures,
  createBooking,
  getBookings,
  updateBookingStatus,
  getAdventureBookings,
  getAllBookings,
  rateAdventure,
  getAdventureImage,
  deleteAdventureImage,
  deleteMultipleAdventureImages,
  confirmCardPayment,
  cancelBooking,
} from "./adventureController";
import categoryRoutes from "./category";
import orderRoutes from "./order";
import {
  adventureUpload,
  parseAdventureFormDataFields,
} from "../../middleware/adventureUpload";

// Import AuthRequest interface
interface AuthRequest extends express.Request {
  user?: {
    id: string;
    role: "user" | "vendor" | "adventurer" | "admin";
  };
}

const router = express.Router();

// Mount category and order routes
router.use("/categories", categoryRoutes);
router.use("/orders", orderRoutes);

// Image routes
router.get("/images/:fileId", getAdventureImage as RequestHandler);
router.delete(
  "/images",
  [auth, adventurerMiddleware] as RequestHandler[],
  deleteMultipleAdventureImages as RequestHandler
);
router.delete(
  "/images/:fileId",
  [auth, adventurerMiddleware] as RequestHandler[],
  deleteAdventureImage as RequestHandler
);

// Admin routes
router.get(
  "/admin/all-bookings",
  [auth, admin] as RequestHandler[],
  getAllBookings as RequestHandler
);

// Booking routes
router.get("/bookings", auth as RequestHandler, getBookings as RequestHandler);
router.put(
  "/bookings/:id/status",
  [auth, adventurerMiddleware] as RequestHandler[],
  updateBookingStatus as RequestHandler
);
router.put(
  "/bookings/:id/confirm-payment",
  auth as RequestHandler,
  confirmCardPayment as RequestHandler
);
router.put(
  "/bookings/:id/cancel",
  auth as RequestHandler,
  cancelBooking as RequestHandler
);

// Adventure specific routes
router.get(
  "/adventurer/adventures",
  [auth, adventurerMiddleware] as RequestHandler[],
  getAdventurerAdventures as RequestHandler
);

// Adventure CRUD routes
router.post(
  "/",
  [
    auth,
    adventurerMiddleware,
    (req: AuthRequest, res: Response, next: NextFunction) => {
      // Additional check to ensure only adventurers can create adventures
      if (req.user?.role !== "adventurer") {
        return res
          .status(403)
          .json({ message: "Only adventurers can create adventures" });
      }
      next();
    },
    adventureUpload.fields([
      { name: "image", maxCount: 1 },
      { name: "multipleImages", maxCount: 5 },
    ]),
    parseAdventureFormDataFields,
  ] as RequestHandler[],
  createAdventure as RequestHandler
);

// Adventure ID specific routes
router.get(
  "/:id/bookings",
  [auth, adventurerMiddleware] as RequestHandler[],
  getAdventureBookings as RequestHandler
);
router.post(
  "/:id/bookings",
  auth as RequestHandler,
  createBooking as RequestHandler
);
router.post(
  "/:id/rate",
  auth as RequestHandler,
  rateAdventure as RequestHandler
);
router.put(
  "/:id",
  [
    auth,
    adventurerMiddleware,
    adventureUpload.fields([
      { name: "image", maxCount: 1 },
      { name: "multipleImages", maxCount: 5 },
    ]),
    parseAdventureFormDataFields,
  ] as RequestHandler[],
  updateAdventure as RequestHandler
);
router.delete(
  "/:id",
  [auth, adventurerMiddleware] as RequestHandler[],
  deleteAdventure as RequestHandler
);
router.get("/:id", getAdventure as RequestHandler);

// Generic routes
router.get("/", getAllAdventures as RequestHandler);

export default router;
