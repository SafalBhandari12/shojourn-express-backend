import express, { RequestHandler } from "express";
import { auth } from "../../middleware/auth";
import { admin } from "../../middleware/admin";
import adventurerMiddleware from "../../middleware/adventurerMiddleware";
import AdventureBooking from "../../models/AdventureBooking";
import Adventure from "../../models/Adventure";

const router = express.Router();

// Create booking
router.post(
  "/:adventureId/book",
  auth as RequestHandler,
  (async (req, res) => {
    try {
      const adventure = await Adventure.findById(req.params.adventureId);
      if (!adventure) {
        return res.status(404).json({ message: "Adventure not found" });
      }

      const { numberOfParticipants, bookingDate, participants } = req.body;

      // Check seat availability for the specific day
      const bookingDay = new Date(bookingDate).toISOString().split("T")[0];
      const dayAvailability = adventure.seatAvailability[bookingDay];

      if (
        !dayAvailability ||
        dayAvailability.availableSeats < numberOfParticipants
      ) {
        return res
          .status(400)
          .json({ message: "Not enough seats available for this day" });
      }

      // Calculate total price with discount if applicable
      let totalPrice = dayAvailability.price || adventure.price;
      if (
        adventure.discount.isActive &&
        new Date() >= new Date(adventure.discount.validFrom) &&
        new Date() <= new Date(adventure.discount.validUntil)
      ) {
        totalPrice = totalPrice * (1 - adventure.discount.percentage / 100);
      }
      totalPrice = totalPrice * numberOfParticipants;

      const booking = new AdventureBooking({
        adventure: adventure._id,
        user: req.user?.id,
        numberOfParticipants,
        bookingDate,
        totalPrice,
        participants,
      });

      await booking.save();

      // Update seat availability
      adventure.seatAvailability[bookingDay].availableSeats -=
        numberOfParticipants;
      await adventure.save();

      res.status(201).json(booking);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }) as RequestHandler
);

// Get user's bookings
router.get(
  "/my-bookings",
  auth as RequestHandler,
  (async (req, res) => {
    try {
      const bookings = await AdventureBooking.find({ user: req.user?.id })
        .populate("adventure")
        .sort({ bookingDate: -1 });

      res.json(bookings);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }) as RequestHandler
);

// Get adventure bookings (adventurer only)
router.get(
  "/adventure/:adventureId/bookings",
  [auth, adventurerMiddleware] as RequestHandler[],
  (async (req, res) => {
    try {
      const adventure = await Adventure.findOne({
        _id: req.params.adventureId,
        adventurer: req.user?.id,
      });

      if (!adventure) {
        return res.status(404).json({ message: "Adventure not found" });
      }

      const bookings = await AdventureBooking.find({ adventure: adventure._id })
        .populate("user", "name email")
        .sort({ bookingDate: -1 });

      res.json(bookings);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }) as RequestHandler
);

// Update booking status (adventurer only)
router.put(
  "/:bookingId/status",
  [auth, adventurerMiddleware] as RequestHandler[],
  (async (req, res) => {
    try {
      const { status } = req.body;
      const booking = await AdventureBooking.findById(req.params.bookingId);

      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Verify the adventure belongs to the adventurer
      const adventure = await Adventure.findOne({
        _id: booking.adventure,
        adventurer: req.user?.id,
      });

      if (!adventure) {
        return res
          .status(403)
          .json({ message: "Not authorized to update this booking" });
      }

      booking.status = status;
      await booking.save();

      res.json(booking);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }) as RequestHandler
);

// Get all bookings (admin only)
router.get(
  "/admin/all-bookings",
  [auth, admin] as RequestHandler[],
  (async (req, res) => {
    try {
      const { page = 1, limit = 10, status, startDate, endDate } = req.query;

      const query: any = {};

      if (status) query.status = status;
      if (startDate || endDate) {
        query.bookingDate = {};
        if (startDate) query.bookingDate.$gte = new Date(startDate as string);
        if (endDate) query.bookingDate.$lte = new Date(endDate as string);
      }

      const bookings = await AdventureBooking.find(query)
        .populate("adventure", "name location")
        .populate("user", "name email")
        .sort({ bookingDate: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));

      const total = await AdventureBooking.countDocuments(query);

      res.json({
        bookings,
        totalPages: Math.ceil(total / Number(limit)),
        currentPage: Number(page),
        total,
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }) as RequestHandler
);

export default router;
