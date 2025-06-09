import { Request, Response } from "express";
import Rental, { IRental, IRentalWithUrls } from "../../models/Rental";
import RentalBooking, {
  IPopulatedRentalBooking,
} from "../../models/RentalBooking";
import { Types } from "mongoose";
import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";

interface AuthRequest extends Request {
  user?: {
    id: string | Types.ObjectId;
    role: "user" | "vendor" | "adventurer" | "admin" | "renter";
  };
}

// Utility to upload a file buffer to GridFS and return the file ID
async function uploadToGridFS(
  buffer: Buffer,
  filename: string,
  mimetype: string
): Promise<ObjectId> {
  const bucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: "uploads",
  });
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: mimetype,
    });
    uploadStream.end(buffer, () => {
      resolve(uploadStream.id as ObjectId);
    });
    uploadStream.on("error", reject);
  });
}

function getFullImageUrl(req: Request, fileId: string) {
  const protocol =
    process.env.NODE_ENV === "production" ? "https" : req.protocol;
  const baseUrl = `${protocol}://${req.get("host")}`;
  return `${baseUrl}/api/rentals/images/${fileId}`;
}

// Helper function to convert rental to object with URLs
function addImageUrlsToRental(rental: any, req: Request): IRentalWithUrls {
  // Explicitly convert to object using toObject(), which triggers the toJSON transform
  const rentalObj = rental?.toObject ? rental.toObject() : rental;

  return {
    ...rentalObj,
    // Use rentalObj.id which should be present after toJSON transform
    imageUrl: rentalObj.image
      ? getFullImageUrl(req, rentalObj.image.toString())
      : null,
    multipleImageUrls:
      rentalObj.images?.map((id: any) => getFullImageUrl(req, id.toString())) ||
      [],
  } as IRentalWithUrls;
}

// Helper function to calculate hours between two times
const calculateHours = (startTime: string, endTime: string): number => {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);

  let hours = endHours - startHours;
  let minutes = endMinutes - startMinutes;

  if (minutes < 0) {
    hours -= 1;
    minutes += 60;
  }

  return hours + minutes / 60;
};

// Helper function to calculate days between two dates
const calculateDays = (startDate: Date, endDate: Date): number => {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Helper function to check for overlapping bookings
const hasOverlappingBookings = async (
  rentalId: mongoose.Types.ObjectId,
  startDate: Date,
  endDate: Date,
  startTime: string,
  endTime: string,
  bookingType: "hourly" | "daily"
): Promise<boolean> => {
  const existingBookings = await RentalBooking.find({
    rental: rentalId,
    status: { $ne: "cancelled" },
    $or: [
      // Check for overlapping daily bookings
      {
        bookingType: "daily",
        $or: [
          {
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
          },
        ],
      },
      // Check for overlapping hourly bookings
      {
        bookingType: "hourly",
        startDate: startDate,
        $or: [
          {
            startTime: { $lt: endTime },
            endTime: { $gt: startTime },
          },
        ],
      },
    ],
  });

  return existingBookings.length > 0;
};

// Helper function to validate time slot availability
const validateTimeSlot = async (
  rentalId: mongoose.Types.ObjectId,
  startDate: Date,
  endDate: Date,
  startTime: string,
  endTime: string,
  bookingType: "hourly" | "daily"
): Promise<{ isValid: boolean; message?: string }> => {
  // Check for overlapping bookings
  const hasOverlap = await hasOverlappingBookings(
    rentalId,
    startDate,
    endDate,
    startTime,
    endTime,
    bookingType
  );

  if (hasOverlap) {
    return {
      isValid: false,
      message: "This time slot is already booked",
    };
  }

  // For hourly bookings, check 1-hour buffer
  if (bookingType === "hourly") {
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    // Check if there's a booking ending within 1 hour before this booking
    const oneHourBefore = new Date(startDate);
    oneHourBefore.setHours(startHour - 1, startMinute);

    const existingBookingsBefore = await RentalBooking.find({
      rental: rentalId,
      status: { $ne: "cancelled" },
      bookingType: "hourly",
      startDate: startDate,
      endTime: { $gt: oneHourBefore.toTimeString().slice(0, 5) },
    });

    if (existingBookingsBefore.length > 0) {
      return {
        isValid: false,
        message: "There must be at least 1 hour gap between bookings",
      };
    }

    // Check if there's a booking starting within 1 hour after this booking
    const oneHourAfter = new Date(startDate);
    oneHourAfter.setHours(endHour + 1, endMinute);

    const existingBookingsAfter = await RentalBooking.find({
      rental: rentalId,
      status: { $ne: "cancelled" },
      bookingType: "hourly",
      startDate: startDate,
      startTime: { $lt: oneHourAfter.toTimeString().slice(0, 5) },
    });

    if (existingBookingsAfter.length > 0) {
      return {
        isValid: false,
        message: "There must be at least 1 hour gap between bookings",
      };
    }
  }

  return { isValid: true };
};

// Create a new rental
export const createRental = async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      description,
      price,
      category,
      location,
      features,
      rentalType,
      specifications,
      availability,
      insurance,
      pricing,
      locationDetails,
      licensePlate,
      color,
      doors,
      seats,
      mileage,
      fuelType,
      transmission,
      year,
      model,
      make,
      totalSeats,
    } = req.body;

    // Validate required fields
    if (!title || !description || !price || !category || !location) {
      return res.status(400).json({
        message: "Missing required fields",
        details:
          "Title, description, price, category, and location are required",
      });
    }

    // Validate files
    if (!req.files) {
      return res.status(400).json({
        message: "No files uploaded",
        details: "At least one image is required",
      });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // Validate main image
    if (!files.image || files.image.length === 0) {
      return res.status(400).json({
        message: "Main image is required",
        details: "Please upload a main image for the rental",
      });
    }

    // Upload main image
    const mainImageId = await uploadToGridFS(
      files.image[0].buffer,
      files.image[0].originalname,
      files.image[0].mimetype
    );

    // Upload additional images
    const additionalImageIds: mongoose.Types.ObjectId[] = [];
    if (files.multipleImages && files.multipleImages.length > 0) {
      for (const file of files.multipleImages) {
        try {
          const imageId = await uploadToGridFS(
            file.buffer,
            file.originalname,
            file.mimetype
          );
          additionalImageIds.push(imageId);
        } catch (error) {
          // Silently handle error
        }
      }
    }

    // Upload documents if provided
    const documentIds: { [key: string]: mongoose.Types.ObjectId } = {};
    if (files.registration && files.registration.length > 0) {
      documentIds.registration = await uploadToGridFS(
        files.registration[0].buffer,
        files.registration[0].originalname,
        files.registration[0].mimetype
      );
    }
    if (files.insurance && files.insurance.length > 0) {
      documentIds.insurance = await uploadToGridFS(
        files.insurance[0].buffer,
        files.insurance[0].originalname,
        files.insurance[0].mimetype
      );
    }
    if (files.inspection && files.inspection.length > 0) {
      documentIds.inspection = await uploadToGridFS(
        files.inspection[0].buffer,
        files.inspection[0].originalname,
        files.inspection[0].mimetype
      );
    }

    // Create rental object with all images
    const rental = new Rental({
      title,
      description,
      price,
      category,
      location,
      features: Array.isArray(features) ? features : [features],
      rentalType,
      specifications,
      availability,
      insurance,
      pricing,
      locationDetails,
      image: mainImageId, // Set the main image
      images: additionalImageIds, // Set additional images
      documents: documentIds,
      licensePlate,
      color,
      doors,
      seats,
      mileage,
      fuelType,
      transmission,
      year,
      model,
      make,
      renter: req.user?.id,
      totalSeats,
    });

    // Save rental
    await rental.save();

    // Get full URLs for all images
    const mainImageUrl = getFullImageUrl(req, mainImageId.toString());
    const additionalImageUrls = await Promise.all(
      additionalImageIds.map((imageId) =>
        getFullImageUrl(req, imageId.toString())
      )
    );

    // Create response object with all image URLs
    const response = {
      ...rental.toObject(),
      imageUrl: mainImageUrl,
      multipleImageUrls: additionalImageUrls,
    };

    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({
      message: "Error creating rental",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update a rental
export const updateRental = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid rental ID format",
        details: "The provided rental ID is not valid",
      });
    }

    const rental = await Rental.findById(id);

    if (!rental) {
      return res.status(404).json({
        message: "Rental not found",
        details: "No rental exists with the provided ID",
      });
    }

    // Check if user is the renter or admin
    const userId = req.user?.id?.toString();
    const renterId = rental.renter.toString();

    if (renterId !== userId && req.user?.role !== "admin") {
      return res.status(403).json({
        message: "Not authorized",
        details: "Only the rental owner or admin can update this rental",
      });
    }

    // Parse JSON strings if they exist
    const features = req.body.features
      ? JSON.parse(req.body.features)
      : undefined;
    const specifications = req.body.specifications
      ? JSON.parse(req.body.specifications)
      : undefined;
    const pricing = req.body.pricing ? JSON.parse(req.body.pricing) : undefined;
    const locationDetails = req.body.locationDetails
      ? JSON.parse(req.body.locationDetails)
      : undefined;
    const insurance = req.body.insurance
      ? JSON.parse(req.body.insurance)
      : undefined;

    // Update fields if they exist in the request
    const updateFields: Partial<IRental> = {
      title: req.body.title?.trim(),
      description: req.body.description?.trim(),
      price: req.body.price ? Number(req.body.price) : undefined,
      category: req.body.category,
      location: req.body.location?.trim(),
      features,
      rentalType: req.body.rentalType,
      make: req.body.make?.trim(),
      model: req.body.model?.trim(),
      year: req.body.year ? Number(req.body.year) : undefined,
      transmission: req.body.transmission,
      fuelType: req.body.fuelType,
      mileage: req.body.mileage ? Number(req.body.mileage) : undefined,
      seats: req.body.seats ? Number(req.body.seats) : undefined,
      doors: req.body.doors ? Number(req.body.doors) : undefined,
      color: req.body.color?.trim(),
      licensePlate: req.body.licensePlate?.trim(),
      insurance,
      specifications,
      pricing,
      locationDetails,
      status: req.body.status,
      isListed: req.body.isListed,
    };

    // Handle image uploads
    if (req.files) {
      if (req.files["image"] && req.files["image"].length > 0) {
        const file = req.files["image"][0];
        const imageId = await uploadToGridFS(
          file.buffer,
          file.originalname,
          file.mimetype
        );
        updateFields.image = imageId;
      }

      if (
        req.files["multipleImages"] &&
        req.files["multipleImages"].length > 0
      ) {
        const newImageIds = await Promise.all(
          req.files["multipleImages"].map(async (file) => {
            return await uploadToGridFS(
              file.buffer,
              file.originalname,
              file.mimetype
            );
          })
        );
        updateFields.images = [...(rental.images || []), ...newImageIds];
      }
    }

    // Update the rental
    const updatedRental = await Rental.findByIdAndUpdate(
      id,
      { $set: updateFields },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("category", "name")
      .populate("renter", "name email")
      .populate("ratings.user", "name");

    if (!updatedRental) {
      return res.status(404).json({
        message: "Rental not found",
        details: "The rental could not be updated",
      });
    }

    const rentalWithUrls = addImageUrlsToRental(updatedRental, req);
    res.json(rentalWithUrls);
  } catch (error) {
    res.status(500).json({
      message: "Error updating rental",
      details:
        error instanceof Error ? error.message : "An unexpected error occurred",
    });
  }
};

// Delete a rental
export const deleteRental = async (req: AuthRequest, res: Response) => {
  try {
    const rental = await Rental.findById(req.params.id);

    if (!rental) {
      return res.status(404).json({ message: "Rental not found" });
    }

    // Check if user is the renter or admin
    const userId = req.user?.id?.toString();
    const renterId = rental.renter.toString();

    // Fix: Check if user is either the renter OR an admin
    if (renterId !== userId && req.user?.role !== "admin") {
      return res.status(403).json({
        message: "Not authorized",
        details: "Only the rental owner or admin can delete this rental",
      });
    }

    // Delete images from GridFS
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    if (rental.image) {
      await bucket.delete(new ObjectId(rental.image));
    }
    if (rental.images && rental.images.length > 0) {
      await Promise.all(
        rental.images.map((id) => bucket.delete(new ObjectId(id)))
      );
    }

    await rental.deleteOne();
    res.json({ message: "Rental deleted successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get single rental
export const getRental = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid rental ID format",
        details: "The provided rental ID is not valid",
      });
    }

    const rental = await Rental.findById(id)
      .populate("category", "name")
      .populate("renter", "name email")
      .populate("ratings.user", "name");

    if (!rental) {
      return res.status(404).json({
        message: "Rental not found",
        details: "No rental exists with the provided ID",
      });
    }

    const rentalWithUrls = addImageUrlsToRental(rental, req);
    res.json(rentalWithUrls);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching rental",
      details: "An unexpected error occurred while fetching the rental",
    });
  }
};

// Get all rentals
export const getAllRentals = async (req: Request, res: Response) => {
  try {
    const rentals = await Rental.find({ isListed: true })
      .populate("renter", "name")
      .populate("category", "name");

    const rentalsWithUrls = rentals.map((rental) =>
      addImageUrlsToRental(rental, req)
    );

    res.json(rentalsWithUrls);
  } catch (error: any) {
    res.status(500).json({
      message: "Error fetching rentals",
      details: error.message,
    });
  }
};

// Get rentals by renter
export const getRenterRentals = async (req: AuthRequest, res: Response) => {
  try {
    const renterId = req.user?.id;
    if (!renterId) {
      return res.status(401).json({ message: "Not authenticated as renter" });
    }

    const rentals = await Rental.find({ renter: renterId }).populate(
      "category",
      "name"
    );

    const rentalsWithUrls = rentals.map((rental) =>
      addImageUrlsToRental(rental, req)
    );

    res.json(rentalsWithUrls);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Create a booking
export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    const {
      bookingType,
      startDate,
      endDate,
      startTime,
      endTime,
      paymentMethod,
    } = req.body;
    const rental = await Rental.findById(req.params.id);

    if (!rental) {
      return res.status(404).json({ message: "Rental not found" });
    }

    // Check if rental is listed
    if (!rental.isListed) {
      return res.status(400).json({
        message: "Rental is not available for booking",
        details: "This rental has been unlisted by the owner",
      });
    }

    // Validate dates and times
    const bookingStartDate = new Date(startDate);
    const bookingEndDate = new Date(endDate);
    const now = new Date();

    if (bookingStartDate < now) {
      return res
        .status(400)
        .json({ message: "Start date cannot be in the past" });
    }

    if (bookingEndDate < bookingStartDate) {
      return res
        .status(400)
        .json({ message: "End date must be after start date" });
    }

    // Validate payment method
    if (!paymentMethod || !["cash", "card"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    // Validate booking type specific requirements
    if (bookingType === "hourly") {
      if (!startTime || !endTime) {
        return res.status(400).json({
          message: "Start time and end time are required for hourly bookings",
        });
      }

      // Validate time format
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return res
          .status(400)
          .json({ message: "Invalid time format. Use HH:mm format" });
      }

      // Calculate total hours
      const totalHours = calculateHours(startTime, endTime);
      if (totalHours < rental.pricing.minimumHours) {
        return res.status(400).json({
          message: `Minimum booking duration is ${rental.pricing.minimumHours} hours`,
        });
      }

      // Validate time slot availability
      const timeSlotValidation = await validateTimeSlot(
        rental._id,
        bookingStartDate,
        bookingEndDate,
        startTime,
        endTime,
        "hourly"
      );

      if (!timeSlotValidation.isValid) {
        return res.status(400).json({ message: timeSlotValidation.message });
      }

      // Calculate total price for hourly booking
      const totalPrice = totalHours * rental.pricing.hourlyRate;

      // Create booking
      const booking = new RentalBooking({
        rental: rental._id,
        user: req.user?.id,
        bookingType: "hourly",
        startDate: bookingStartDate,
        endDate: bookingEndDate,
        startTime,
        endTime,
        totalHours,
        totalPrice,
        status: "pending",
        paymentMethod,
        paymentStatus: paymentMethod === "cash" ? "pending" : "pending",
      });

      await booking.save();
      res.status(201).json(booking);
    } else if (bookingType === "daily") {
      // Calculate total days
      const totalDays = calculateDays(bookingStartDate, bookingEndDate);

      // Validate time slot availability
      const timeSlotValidation = await validateTimeSlot(
        rental._id,
        bookingStartDate,
        bookingEndDate,
        startTime || "00:00",
        endTime || "23:59",
        "daily"
      );

      if (!timeSlotValidation.isValid) {
        return res.status(400).json({ message: timeSlotValidation.message });
      }

      // Calculate total price for daily booking
      const totalPrice = totalDays * rental.pricing.dailyRate;

      // Create booking
      const booking = new RentalBooking({
        rental: rental._id,
        user: req.user?.id,
        bookingType: "daily",
        startDate: bookingStartDate,
        endDate: bookingEndDate,
        totalDays,
        totalPrice,
        status: "pending",
        paymentMethod,
        paymentStatus: paymentMethod === "cash" ? "pending" : "pending",
      });

      await booking.save();
      res.status(201).json(booking);
    } else {
      return res.status(400).json({ message: "Invalid booking type" });
    }
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get all bookings
export const getBookings = async (req: AuthRequest, res: Response) => {
  try {
    const bookings = await RentalBooking.find({ user: req.user?.id })
      .populate({
        path: "rental",
        select: "title price image renter",
        populate: {
          path: "renter",
          select: "id name email",
        },
      })
      .sort({ createdAt: -1 })
      .lean();

    const bookingsWithUrls = bookings.map((booking) => {
      if (booking.rental && typeof booking.rental === "object") {
        const rentalObj = booking.rental as any;
        rentalObj.id = rentalObj._id?.toString();
        delete rentalObj._id;
        delete rentalObj.__v;

        rentalObj.imageUrl = rentalObj.image
          ? getFullImageUrl(req, rentalObj.image.toString())
          : null;

        // Ensure renter ID is included
        if (rentalObj.renter) {
          rentalObj.renterId = rentalObj.renter.id;
          rentalObj.renterName = rentalObj.renter.name;
          rentalObj.renterEmail = rentalObj.renter.email;
          delete rentalObj.renter;
        }

        booking.rental = rentalObj;
      }

      return booking;
    });

    res.json(bookingsWithUrls);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get all bookings (admin)
export const getAllBookings = async (req: AuthRequest, res: Response) => {
  try {
    const bookings = await RentalBooking.find()
      .populate({
        path: "user",
        select: "id name email",
      })
      .populate({
        path: "rental",
        select: "title price image renter",
        populate: {
          path: "renter",
          select: "id name email",
        },
      })
      .sort({ createdAt: -1 })
      .lean();

    const formattedBookings = bookings.map((booking: any) => {
      const formattedBooking: any = {
        id: booking._id.toString(),
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        bookingType: booking.bookingType,
        startDate: booking.startDate,
        endDate: booking.endDate,
        totalHours: booking.totalHours,
        totalDays: booking.totalDays,
        totalPrice: booking.totalPrice,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      };

      // Add time fields for hourly bookings
      if (booking.bookingType === "hourly") {
        formattedBooking.startTime = booking.startTime;
        formattedBooking.endTime = booking.endTime;
      }

      // Format user data
      if (booking.user && typeof booking.user === "object") {
        formattedBooking.user = {
          id: booking.user._id?.toString(),
          name: booking.user.name,
          email: booking.user.email,
        };
      }

      // Format rental data
      if (booking.rental && typeof booking.rental === "object") {
        formattedBooking.rental = {
          id: booking.rental._id?.toString(),
          title: booking.rental.title,
          price: booking.rental.price,
          imageUrl: booking.rental.image
            ? getFullImageUrl(req, booking.rental.image.toString())
            : null,
          renter: booking.rental.renter
            ? {
                id: booking.rental.renter._id?.toString(),
                name: booking.rental.renter.name,
                email: booking.rental.renter.email,
              }
            : null,
        };
      }

      return formattedBooking;
    });

    res.json(formattedBookings);
  } catch (error: any) {
    res.status(500).json({
      message: "Error fetching bookings",
      details: error.message,
    });
  }
};

// Get rental bookings
export const getRentalBookings = async (req: AuthRequest, res: Response) => {
  try {
    const rental = await Rental.findById(req.params.id);

    if (!rental) {
      return res.status(404).json({ message: "Rental not found" });
    }

    // Check if user is the renter or admin
    if (
      rental.renter.toString() !== req.user?.id &&
      req.user?.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const bookings = await RentalBooking.find({ rental: rental._id })
      .populate("user", "name email")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Update booking status
export const updateBookingStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    const booking = await RentalBooking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const rental = await Rental.findById(booking.rental);

    // Check if user is the renter or admin
    if (
      rental?.renter.toString() !== req.user?.id &&
      req.user?.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Prevent status change if booking is completed
    if (booking.status === "completed") {
      return res.status(400).json({
        message: "Cannot change status of a completed booking",
      });
    }

    // Define valid status transitions with proper typing
    type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";
    type StatusTransitions = {
      [key in BookingStatus]: BookingStatus[];
    };

    const validTransitions: StatusTransitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["completed", "cancelled"],
      cancelled: [],
      completed: [],
    };

    if (
      !validTransitions[booking.status as BookingStatus].includes(
        status as BookingStatus
      )
    ) {
      return res.status(400).json({
        message: `Cannot change status from ${booking.status} to ${status}`,
      });
    }

    booking.status = status as BookingStatus;
    await booking.save();

    res.json(booking);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Cancel booking
export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const booking = await RentalBooking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // First check if the booking is pending
    if (booking.status !== "pending") {
      return res.status(400).json({
        message: "Cannot cancel booking",
        details: "Only pending bookings can be cancelled",
      });
    }

    // Then check if the user is the booking owner
    const bookingUserId = booking.user.toString();
    const currentUserId = req.user?.id?.toString();

    if (bookingUserId !== currentUserId) {
      return res.status(403).json({
        message: "Not authorized",
        details: "Only the booking owner can cancel their booking",
      });
    }

    // If both checks pass, cancel the booking
    booking.status = "cancelled";
    await booking.save();

    res.json({
      message: "Booking cancelled successfully",
      booking,
    });
  } catch (error: any) {
    res.status(400).json({
      message: "Error cancelling booking",
      details: error.message,
    });
  }
};

// Rate a rental
export const rateRental = async (req: AuthRequest, res: Response) => {
  try {
    const { rating, review } = req.body;
    const rental = await Rental.findById(req.params.id);

    if (!rental) {
      return res.status(404).json({ message: "Rental not found" });
    }

    // Validate rating
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({
        message: "Invalid rating",
        details: "Rating must be a number between 1 and 5",
      });
    }

    // Check if user has booked this rental
    const booking = await RentalBooking.findOne({
      rental: rental._id,
      user: req.user?.id,
      status: "completed",
    });

    if (!booking) {
      return res.status(403).json({
        message: "You can only rate rentals you have booked and completed",
      });
    }

    // Check if user has already rated this rental
    const existingRatingIndex = rental.ratings.findIndex(
      (r) => r.user.toString() === req.user?.id?.toString()
    );

    if (existingRatingIndex !== -1) {
      // Update existing rating
      rental.ratings[existingRatingIndex] = {
        user: new mongoose.Types.ObjectId(req.user?.id),
        rating,
        review: review || rental.ratings[existingRatingIndex].review,
      };
    } else {
      // Add new rating
      rental.ratings.push({
        user: new mongoose.Types.ObjectId(req.user?.id),
        rating,
        review: review || "",
      });
    }

    // Calculate new average rating
    const totalRatings = rental.ratings.length;
    const sumRatings = rental.ratings.reduce((sum, r) => sum + r.rating, 0);
    rental.averageRating = sumRatings / totalRatings;

    await rental.save();

    // Return the updated rental with populated fields
    const updatedRental = await Rental.findById(rental._id)
      .populate("category", "name")
      .populate("renter", "name email")
      .populate("ratings.user", "name");

    res.json(addImageUrlsToRental(updatedRental, req));
  } catch (error: any) {
    res.status(500).json({
      message: "Error rating rental",
      details: error.message,
    });
  }
};

// Get rental image
export const getRentalImage = async (req: Request, res: Response) => {
  try {
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    const fileId = new ObjectId(req.params.fileId);
    const files = await bucket.find({ _id: fileId }).toArray();

    if (files.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }

    const file = files[0];
    const downloadStream = bucket.openDownloadStream(fileId);

    res.set("Content-Type", file.contentType);
    downloadStream.pipe(res);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Delete rental image
export const deleteRentalImage = async (req: AuthRequest, res: Response) => {
  try {
    const fileId = new ObjectId(req.params.fileId);
    const rental = await Rental.findOne({
      $or: [{ image: fileId }, { images: fileId }],
    });

    if (!rental) {
      return res.status(404).json({ message: "Image not found" });
    }

    // Check if user is the renter or admin
    if (
      rental.renter.toString() !== req.user?.id &&
      req.user?.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Delete from GridFS
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });
    await bucket.delete(fileId);

    // Remove from rental
    if (rental.image?.equals(fileId)) {
      rental.image = undefined;
    } else {
      rental.images = rental.images?.filter((id) => !id.equals(fileId));
    }

    await rental.save();
    res.json({ message: "Image deleted successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Delete multiple rental images
export const deleteMultipleRentalImages = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { imageIds } = req.body;

    if (!Array.isArray(imageIds)) {
      return res.status(400).json({ message: "Invalid image IDs" });
    }

    const objectIds = imageIds.map((id) => new ObjectId(id));
    const rental = await Rental.findOne({
      $or: [{ image: { $in: objectIds } }, { images: { $in: objectIds } }],
    });

    if (!rental) {
      return res.status(404).json({ message: "Rental not found" });
    }

    // Check if user is the renter or admin
    if (
      rental.renter.toString() !== req.user?.id &&
      req.user?.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Delete from GridFS
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });
    await Promise.all(objectIds.map((id) => bucket.delete(id)));

    // Remove from rental
    if (rental.image && objectIds.some((id) => rental.image?.equals(id))) {
      rental.image = undefined;
    }
    rental.images = rental.images?.filter(
      (id) => !objectIds.some((objectId) => id.equals(objectId))
    );

    await rental.save();
    res.json({ message: "Images deleted successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Confirm card payment
export const confirmCardPayment = async (req: AuthRequest, res: Response) => {
  try {
    const booking = await RentalBooking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Check if user is the booking owner
    if (booking.user.toString() !== req.user?.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    booking.paymentStatus = "paid";
    await booking.save();

    res.json(booking);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Toggle rental listing status
export const toggleRentalListing = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isListed } = req.body;

    if (typeof isListed !== "boolean") {
      return res.status(400).json({
        message: "Invalid request",
        details: "isListed must be a boolean value",
      });
    }

    const rental = await Rental.findById(id);

    if (!rental) {
      return res.status(404).json({
        message: "Rental not found",
        details: "No rental exists with the provided ID",
      });
    }

    // Check if user is the renter or admin
    const userId = req.user?.id?.toString();
    const renterId = rental.renter.toString();

    if (renterId !== userId && req.user?.role !== "admin") {
      return res.status(403).json({
        message: "Not authorized",
        details: "Only the rental owner or admin can update listing status",
      });
    }

    rental.isListed = isListed;
    await rental.save();

    res.json({
      message: `Rental ${isListed ? "listed" : "unlisted"} successfully`,
      rental: addImageUrlsToRental(rental, req),
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Error updating rental listing status",
      details: error.message,
    });
  }
};