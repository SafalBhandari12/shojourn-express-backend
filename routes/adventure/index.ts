import express, { RequestHandler } from "express";
import { auth } from "../../middleware/auth";
import vendorMiddleware from "../../middleware/vendorMiddleware";
import {
  createAdventure,
  updateAdventure,
  deleteAdventure,
  getAdventure,
  getAllAdventures,
  getVendorAdventures,
  createBooking,
  getBookings,
  updateBookingStatus,
  getAdventureBookings,
} from "./adventureController";

const router = express.Router();

// Adventure CRUD routes
router.post(
  "/",
  [auth, vendorMiddleware] as RequestHandler[],
  createAdventure as RequestHandler
);
router.put(
  "/:id",
  [auth, vendorMiddleware] as RequestHandler[],
  updateAdventure as RequestHandler
);
router.delete(
  "/:id",
  [auth, vendorMiddleware] as RequestHandler[],
  deleteAdventure as RequestHandler
);
router.get("/:id", getAdventure as RequestHandler);
router.get("/", getAllAdventures as RequestHandler);
router.get(
  "/vendor/adventures",
  [auth, vendorMiddleware] as RequestHandler[],
  getVendorAdventures as RequestHandler
);

// Booking routes
router.post(
  "/:id/book",
  auth as RequestHandler,
  createBooking as RequestHandler
);
router.get("/bookings", auth as RequestHandler, getBookings as RequestHandler);
router.put(
  "/bookings/:id/status",
  [auth, vendorMiddleware] as RequestHandler[],
  updateBookingStatus as RequestHandler
);
router.get(
  "/:id/bookings",
  [auth, vendorMiddleware] as RequestHandler[],
  getAdventureBookings as RequestHandler
);

export default router;
