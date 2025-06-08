import express, { RequestHandler, Response, NextFunction } from "express";
import { auth } from "../../middleware/auth";
import renterMiddleware from "../../middleware/renterMiddleware";
import { admin } from "../../middleware/admin";
import {
  createRental,
  updateRental,
  deleteRental,
  getRental,
  getAllRentals,
  getRenterRentals,
  createBooking,
  getBookings,
  updateBookingStatus,
  getRentalBookings,
  getAllBookings,
  rateRental,
  getRentalImage,
  deleteRentalImage,
  deleteMultipleRentalImages,
  confirmCardPayment,
  cancelBooking,
} from "./rentalController";
import categoryRoutes from "./category";
import {
  rentalUpload,
  parseRentalFormDataFields,
} from "../../middleware/rentalUpload";

// Import AuthRequest interface
interface AuthRequest extends express.Request {
  user?: {
    id: string;
    role: "user" | "vendor" | "adventurer" | "admin" | "renter";
  };
}

const router = express.Router();

// Mount category routes
router.use("/categories", categoryRoutes);

// Image routes
router.get("/images/:fileId", getRentalImage as RequestHandler);
router.delete(
  "/images",
  [auth, renterMiddleware] as RequestHandler[],
  deleteMultipleRentalImages as RequestHandler
);
router.delete(
  "/images/:fileId",
  [auth, renterMiddleware] as RequestHandler[],
  deleteRentalImage as RequestHandler
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
  [auth, renterMiddleware] as RequestHandler[],
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

// Rental specific routes
router.get(
  "/renter/rentals",
  [auth, renterMiddleware] as RequestHandler[],
  getRenterRentals as RequestHandler
);

// Rental CRUD routes
router.post(
  "/",
  [
    auth,
    renterMiddleware,
    (req: AuthRequest, res: Response, next: NextFunction) => {
      // Additional check to ensure only renters can create rentals
      if (req.user?.role !== "renter") {
        return res
          .status(403)
          .json({ message: "Only renters can create rentals" });
      }
      next();
    },
    rentalUpload,
    parseRentalFormDataFields,
  ] as RequestHandler[],
  createRental as RequestHandler
);

// Rental ID specific routes
router.get(
  "/:id/bookings",
  [auth, renterMiddleware] as RequestHandler[],
  getRentalBookings as RequestHandler
);
router.post(
  "/:id/bookings",
  auth as RequestHandler,
  createBooking as RequestHandler
);
router.post("/:id/rate", auth as RequestHandler, rateRental as RequestHandler);
router.put(
  "/:id",
  [
    auth,
    renterMiddleware,
    rentalUpload,
    parseRentalFormDataFields,
  ] as RequestHandler[],
  updateRental as RequestHandler
);
router.delete(
  "/:id",
  [auth, renterMiddleware] as RequestHandler[],
  deleteRental as RequestHandler
);
router.get("/:id", getRental as RequestHandler);

// Generic routes
router.get("/", getAllRentals as RequestHandler);

export default router;
