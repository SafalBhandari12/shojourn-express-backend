import { Request, Response } from "express";
import Adventure from "../../models/Adventure";
import AdventureBooking from "../../models/AdventureBooking";
import { Types } from "mongoose";

interface AuthRequest extends Request {
  user?: {
    id: string | Types.ObjectId;
    role: "client" | "vendor" | "admin";
  };
}

// Create a new adventure
export const createAdventure = async (req: AuthRequest, res: Response) => {
  try {
    const adventureData = {
      ...req.body,
      vendor: req.user?.id,
    };

    const adventure = new Adventure(adventureData);
    await adventure.save();

    res.status(201).json(adventure);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Update an adventure
export const updateAdventure = async (req: AuthRequest, res: Response) => {
  try {
    const adventure = await Adventure.findOneAndUpdate(
      { _id: req.params.id, vendor: req.user?.id },
      req.body,
      { new: true }
    );

    if (!adventure) {
      return res.status(404).json({ message: "Adventure not found" });
    }

    res.json(adventure);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Delete an adventure
export const deleteAdventure = async (req: AuthRequest, res: Response) => {
  try {
    const adventure = await Adventure.findOneAndDelete({
      _id: req.params.id,
      vendor: req.user?.id,
    });

    if (!adventure) {
      return res.status(404).json({ message: "Adventure not found" });
    }

    res.json({ message: "Adventure deleted successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get a single adventure
export const getAdventure = async (req: Request, res: Response) => {
  try {
    const adventure = await Adventure.findById(req.params.id)
      .populate("vendor", "name email")
      .populate("category", "name");

    if (!adventure) {
      return res.status(404).json({ message: "Adventure not found" });
    }

    res.json(adventure);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get all adventures with filtering and pagination
export const getAllAdventures = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      difficulty,
      location,
      minPrice,
      maxPrice,
      featured,
    } = req.query;

    const query: any = { isActive: true };

    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;
    if (location) query.location = { $regex: location, $options: "i" };
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (featured) query.featured = featured === "true";

    const adventures = await Adventure.find(query)
      .populate("vendor", "name email")
      .populate("category", "name")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .sort({ createdAt: -1 });

    const total = await Adventure.countDocuments(query);

    res.json({
      adventures,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      total,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get vendor's adventures
export const getVendorAdventures = async (req: AuthRequest, res: Response) => {
  try {
    const adventures = await Adventure.find({ vendor: req.user?.id })
      .populate("category", "name")
      .sort({ createdAt: -1 });

    res.json(adventures);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Create a booking
export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    const adventure = await Adventure.findById(req.params.id);
    if (!adventure) {
      return res.status(404).json({ message: "Adventure not found" });
    }

    const { numberOfParticipants, bookingDate, participants } = req.body;

    // Check if there's enough capacity
    if (
      adventure.currentBookings + numberOfParticipants >
      adventure.maxParticipants
    ) {
      return res.status(400).json({ message: "Not enough capacity available" });
    }

    // Calculate total price
    const totalPrice = adventure.price * numberOfParticipants;

    const booking = new AdventureBooking({
      adventure: adventure._id,
      user: req.user?.id,
      numberOfParticipants,
      bookingDate,
      totalPrice,
      participants,
    });

    await booking.save();

    // Update adventure's current bookings
    adventure.currentBookings += numberOfParticipants;
    await adventure.save();

    res.status(201).json(booking);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get user's bookings
export const getBookings = async (req: AuthRequest, res: Response) => {
  try {
    const bookings = await AdventureBooking.find({ user: req.user?.id })
      .populate("adventure")
      .sort({ bookingDate: -1 });

    res.json(bookings);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Update booking status (vendor only)
export const updateBookingStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    const booking = await AdventureBooking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Verify the adventure belongs to the vendor
    const adventure = await Adventure.findOne({
      _id: booking.adventure,
      vendor: req.user?.id,
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
};

// Get bookings for a specific adventure (vendor only)
export const getAdventureBookings = async (req: AuthRequest, res: Response) => {
  try {
    const adventure = await Adventure.findOne({
      _id: req.params.id,
      vendor: req.user?.id,
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
};
