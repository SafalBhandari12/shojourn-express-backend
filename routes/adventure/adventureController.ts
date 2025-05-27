import { Request, Response } from "express";
import Adventure from "../../models/Adventure";
import AdventureBooking from "../../models/AdventureBooking";
import { Types } from "mongoose";
import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";

interface AuthRequest extends Request {
  user?: {
    id: string | Types.ObjectId;
    role: "user" | "vendor" | "adventurer" | "admin";
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
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/api/adventures/images/${fileId}`;
}

// Create a new adventure
export const createAdventure = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is an adventurer (removed admin access)
    if (req.user?.role !== "adventurer") {
      return res
        .status(403)
        .json({ message: "Only adventurers can create adventures" });
    }

    let imageId: ObjectId | null = null;
    let multipleImageIds: ObjectId[] = [];
    if (req.files) {
      if (req.files["image"] && req.files["image"].length > 0) {
        const file = req.files["image"][0];
        imageId = await uploadToGridFS(
          file.buffer,
          file.originalname,
          file.mimetype
        );
      }
      if (
        req.files["multipleImages"] &&
        req.files["multipleImages"].length > 0
      ) {
        for (const file of req.files["multipleImages"]) {
          const id = await uploadToGridFS(
            file.buffer,
            file.originalname,
            file.mimetype
          );
          multipleImageIds.push(id);
        }
      }
    }
    const {
      name,
      description,
      detailedDescription,
      price,
      location,
      duration,
      difficulty,
      ageRestriction,
      requirements,
      safetyInstructions,
      category,
      maxParticipants,
      schedule,
      discount,
      seatAvailability,
    } = req.body;

    // Validate required fields
    const requiredFields = [
      "name",
      "description",
      "detailedDescription",
      "price",
      "location",
      "duration",
      "difficulty",
      "ageRestriction",
      "requirements",
      "safetyInstructions",
      "category",
      "maxParticipants",
      "schedule",
      "discount",
      "seatAvailability",
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ message: `${field} is required` });
      }
    }

    // Validate ageRestriction
    if (!ageRestriction.minAge || !ageRestriction.maxAge) {
      return res.status(400).json({
        message: "Both minAge and maxAge are required in ageRestriction",
      });
    }

    // Validate schedule
    if (
      !schedule.startTime ||
      !schedule.endTime ||
      !schedule.daysAvailable ||
      !schedule.daysAvailable.length
    ) {
      return res
        .status(400)
        .json({ message: "All schedule fields are required" });
    }

    // Validate discount
    if (
      !discount.validFrom ||
      !discount.validUntil ||
      discount.percentage === undefined
    ) {
      return res
        .status(400)
        .json({ message: "All discount fields are required" });
    }

    const adventureData = {
      name,
      description,
      detailedDescription,
      price,
      image: imageId,
      multipleImages: multipleImageIds,
      location,
      duration,
      difficulty,
      ageRestriction,
      requirements,
      safetyInstructions,
      category,
      maxParticipants,
      schedule,
      adventurer: req.user?.id,
      discount: {
        isActive: discount.isActive,
        percentage: discount.percentage,
        validFrom: discount.validFrom,
        validUntil: discount.validUntil,
        originalPrice: price,
      },
      seatAvailability,
      rating: 0,
      featured: false,
      currentBookings: 0,
      bookedBy: 0,
      isActive: true,
    };

    const adventure = new Adventure(adventureData);
    await adventure.save();

    // Convert to object and add full URLs
    const adventureObj = adventure.toObject();
    adventureObj.imageUrl = imageId
      ? getFullImageUrl(req, imageId.toString())
      : null;
    adventureObj.multipleImageUrls = multipleImageIds.map((id) =>
      getFullImageUrl(req, id.toString())
    );

    res.status(201).json(adventureObj);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Update an adventure
export const updateAdventure = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is an adventurer
    if (req.user?.role !== "adventurer" && req.user?.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only adventurers can update adventures" });
    }

    let imageId: ObjectId | null = null;
    let multipleImageIds: ObjectId[] = [];
    if (req.files) {
      if (req.files["image"] && req.files["image"].length > 0) {
        const file = req.files["image"][0];
        imageId = await uploadToGridFS(
          file.buffer,
          file.originalname,
          file.mimetype
        );
      }
      if (
        req.files["multipleImages"] &&
        req.files["multipleImages"].length > 0
      ) {
        for (const file of req.files["multipleImages"]) {
          const id = await uploadToGridFS(
            file.buffer,
            file.originalname,
            file.mimetype
          );
          multipleImageIds.push(id);
        }
      }
    }
    const { discount, seatAvailability, ...updateData } = req.body;
    const updateFields: any = { ...updateData };
    if (imageId) updateFields.image = imageId;
    if (multipleImageIds.length > 0)
      updateFields.multipleImages = multipleImageIds;
    if (discount) {
      updateFields.discount = {
        isActive: discount.isActive,
        percentage: discount.percentage,
        validFrom: discount.validFrom,
        validUntil: discount.validUntil,
        originalPrice: discount.originalPrice,
      };
    }
    if (seatAvailability) {
      updateFields.seatAvailability = seatAvailability;
    }
    const adventure = await Adventure.findOneAndUpdate(
      { _id: req.params.id, adventurer: req.user?.id },
      updateFields,
      { new: true }
    );
    if (!adventure) {
      return res.status(404).json({ message: "Adventure not found" });
    }
    // Fetch the updated adventure to include virtuals and populated fields
    const updatedAdventure = await Adventure.findById(adventure._id)
      .populate("adventurer", "name email")
      .populate("category", "name");
    if (!updatedAdventure) {
      return res
        .status(404)
        .json({ message: "Adventure not found after update" });
    }

    const adventureObj = updatedAdventure.toObject();
    adventureObj.imageUrl = updatedAdventure.image
      ? getFullImageUrl(req, updatedAdventure.image.toString())
      : null;
    adventureObj.multipleImageUrls = (
      updatedAdventure.multipleImages || []
    ).map((id) => getFullImageUrl(req, id.toString()));

    res.json(adventureObj);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Delete an adventure
export const deleteAdventure = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is an adventurer
    if (req.user?.role !== "adventurer" && req.user?.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only adventurers can delete adventures" });
    }

    const adventure = await Adventure.findOne({
      _id: req.params.id,
      adventurer: req.user?.id,
    });
    if (!adventure) {
      return res.status(404).json({ message: "Adventure not found" });
    }
    // Delete associated images from GridFS
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });
    if (adventure.image) {
      try {
        await bucket.delete(adventure.image);
      } catch (error) {
        console.error("Error deleting single image:", error);
      }
    }
    if (adventure.multipleImages && adventure.multipleImages.length > 0) {
      for (const imageId of adventure.multipleImages) {
        try {
          await bucket.delete(imageId);
        } catch (error) {
          console.error("Error deleting multiple image:", error);
        }
      }
    }
    await adventure.deleteOne();
    res.json({ message: "Adventure deleted successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get a single adventure
export const getAdventure = async (req: Request, res: Response) => {
  try {
    const adventure = await Adventure.findById(req.params.id)
      .populate("adventurer", "name email")
      .populate("category", "name");

    if (!adventure) {
      return res.status(404).json({ message: "Adventure not found" });
    }

    const adventureObj = adventure.toObject();
    adventureObj.imageUrl = adventure.image
      ? getFullImageUrl(req, adventure.image.toString())
      : null;
    adventureObj.multipleImageUrls = (adventure.multipleImages || []).map(
      (id) => getFullImageUrl(req, id.toString())
    );

    res.json(adventureObj);
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
      .populate("adventurer", "name email")
      .populate("category", "name")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .sort({ createdAt: -1 });

    const total = await Adventure.countDocuments(query);

    const adventuresWithUrls = adventures.map((adventure) => {
      const adventureObj = adventure.toObject();
      adventureObj.imageUrl = adventure.image
        ? getFullImageUrl(req, adventure.image.toString())
        : null;
      adventureObj.multipleImageUrls = (adventure.multipleImages || []).map(
        (id) => getFullImageUrl(req, id.toString())
      );
      return adventureObj;
    });

    res.json({
      adventures: adventuresWithUrls,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      total,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get adventurer's adventures
export const getAdventurerAdventures = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    // Check if user is an adventurer
    if (req.user?.role !== "adventurer" && req.user?.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only adventurers can view their adventures" });
    }

    const adventures = await Adventure.find({ adventurer: req.user?.id })
      .populate("category", "name")
      .sort({ createdAt: -1 });

    const adventuresWithUrls = adventures.map((adventure) => {
      const adventureObj = adventure.toObject();
      adventureObj.imageUrl = adventure.image
        ? getFullImageUrl(req, adventure.image.toString())
        : null;
      adventureObj.multipleImageUrls = (adventure.multipleImages || []).map(
        (id) => getFullImageUrl(req, id.toString())
      );
      return adventureObj;
    });

    res.json(adventuresWithUrls);
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

    const {
      numberOfParticipants,
      bookingDate,
      participants,
      paymentMethod,
      paymentDetails,
    } = req.body;

    // Validate payment method
    if (!paymentMethod || !["card", "cash"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Invalid payment method. Must be either 'card' or 'cash'",
      });
    }

    // Validate payment details for card payment
    if (paymentMethod === "card") {
      if (
        !paymentDetails ||
        !paymentDetails.cardNumber ||
        !paymentDetails.cardHolderName ||
        !paymentDetails.expiryDate ||
        !paymentDetails.cvv
      ) {
        return res
          .status(400)
          .json({ message: "Card payment details are required" });
      }
    }

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

    // Create booking with payment information
    const booking = new AdventureBooking({
      adventure: adventure._id,
      user: req.user?.id,
      numberOfParticipants,
      bookingDate,
      totalPrice,
      participants,
      paymentMethod,
      paymentDetails: paymentMethod === "card" ? paymentDetails : undefined,
      paymentStatus: "pending", // Set payment status as pending for both cash and card
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
};

// Get user's bookings
export const getBookings = async (req: AuthRequest, res: Response) => {
  try {
    const bookings = await AdventureBooking.find({ user: req.user?.id })
      .populate({
        path: "adventure",
        select: "name location image multipleImages price ratings",
        populate: {
          path: "ratings.user",
          select: "id",
        },
      })
      .sort({ bookingDate: -1 });

    // Transform bookings to include only relevant information
    const transformedBookings = bookings.map((booking) => {
      const adv: any = booking.adventure;

      // Find user's rating for this adventure
      let userRating = 0;
      let overallRating = 0;
      if (adv && adv.ratings) {
        // Calculate overall rating
        const totalRatings = adv.ratings.length;
        if (totalRatings > 0) {
          const sum = adv.ratings.reduce(
            (acc: number, curr: any) => acc + curr.value,
            0
          );
          overallRating = sum / totalRatings;
        }

        // Find user's specific rating
        const userRatingObj = adv.ratings.find(
          (rating: any) =>
            rating.user._id.toString() === req.user?.id?.toString()
        );
        userRating = userRatingObj ? userRatingObj.value : 0;
      }

      return {
        id: booking._id,
        adventure: {
          id: adv._id,
          name: adv.name,
          location: adv.location,
          imageUrl: adv.image
            ? getFullImageUrl(req, adv.image.toString())
            : null,
          multipleImageUrls: (adv.multipleImages || []).map(
            (id: Types.ObjectId) => getFullImageUrl(req, id.toString())
          ),
          price: adv.price,
          rating: overallRating,
          totalRatings: adv.ratings?.length || 0,
          userRating: userRating,
        },
        bookingDate: booking.bookingDate,
        numberOfParticipants: booking.numberOfParticipants,
        totalPrice: booking.totalPrice,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        createdAt: booking.createdAt,
      };
    });

    res.json(transformedBookings);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Update booking status (adventurer only)
export const updateBookingStatus = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is an adventurer
    if (req.user?.role !== "adventurer" && req.user?.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only adventurers can update booking status" });
    }

    const { status } = req.body;
    const booking = await AdventureBooking.findById(req.params.id);

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
};

// Get bookings for a specific adventure (adventurer only)
export const getAdventureBookings = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is an adventurer
    if (req.user?.role !== "adventurer" && req.user?.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only adventurers can view adventure bookings" });
    }

    const adventure = await Adventure.findOne({
      _id: req.params.id,
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
};

// Get all bookings (admin only)
export const getAllBookings = async (req: AuthRequest, res: Response) => {
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
};

// Rate an adventure (user only, after completion)
export const rateAdventure = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;

    if (typeof rating !== "number" || rating < 0 || rating > 5) {
      return res
        .status(400)
        .json({ message: "Invalid rating. Must be a number between 0 and 5" });
    }

    // Check if user has a confirmed booking for this adventure
    const booking = await AdventureBooking.findOne({
      adventure: id,
      user: req.user?.id,
      status: "confirmed",
    });

    if (!booking) {
      return res.status(403).json({
        message: "You can only rate adventures you have booked and confirmed",
      });
    }

    const adventure = await Adventure.findById(id);
    if (!adventure) {
      return res.status(404).json({ message: "Adventure not found" });
    }

    // Initialize ratings array if not present
    if (!adventure.ratings) adventure.ratings = [];

    // Update or add the user's rating
    let updated = false;
    for (let r of adventure.ratings) {
      if (r.user.toString() === req.user?.id?.toString()) {
        r.value = rating;
        updated = true;
        break;
      }
    }

    if (!updated && req.user?.id) {
      adventure.ratings.push({
        user: new Types.ObjectId(req.user.id),
        value: rating,
      });
    }

    // Recalculate average
    const avgRating =
      adventure.ratings.reduce((sum, r) => sum + r.value, 0) /
      adventure.ratings.length;
    adventure.rating = avgRating;
    adventure.bookedBy = adventure.ratings.length;
    await adventure.save();

    res.json({
      message: "Rating updated successfully",
      newRating: avgRating,
      totalRatings: adventure.ratings.length,
    });
  } catch (err: any) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Image retrieval endpoint
export const getAdventureImage = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });
    const _id = new ObjectId(fileId);
    const files = await bucket.find({ _id }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }
    res.set("Content-Type", files[0].contentType || "image/jpeg");
    const downloadStream = bucket.openDownloadStream(_id);
    downloadStream.pipe(res);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Image deletion endpoint (single)
export const deleteAdventureImage = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is an adventurer
    if (req.user?.role !== "adventurer" && req.user?.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only adventurers can delete adventure images" });
    }

    const { fileId } = req.params;
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });
    const _id = new ObjectId(fileId);

    // Find the adventure containing this image and remove the reference
    // Attempt to remove the ID from multipleImages array
    await Adventure.updateMany(
      { multipleImages: _id },
      { $pull: { multipleImages: _id } }
    );

    // Attempt to set the single image field to null if it matches the deleted ID
    const adventure = await Adventure.findOneAndUpdate(
      { image: _id },
      { $set: { image: null } },
      { new: true }
    );

    // Delete the image from GridFS
    try {
      await bucket.delete(_id);
    } catch (error) {
      console.error("Error deleting image from GridFS:", error);
      // Depending on requirements, you might want to return an error here
    }

    if (!adventure) {
      // If the image was only in multipleImages or not found in any adventure
      return res.json({ message: "Image deleted" });
    }

    // If the image was the single image and updated successfully
    res.json({
      message: "Image deleted successfully and removed from adventure",
    });
  } catch (error: any) {
    // Check if the error is due to ObjectId casting for fileId
    if (error instanceof mongoose.Error.CastError && error.path === "_id") {
      return res.status(400).json({ message: "Invalid image ID format." });
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Image deletion endpoint (multiple)
export const deleteMultipleAdventureImages = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    // Check if user is an adventurer
    if (req.user?.role !== "adventurer" && req.user?.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only adventurers can delete adventure images" });
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids must be a non-empty array" });
    }
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });
    const objectIds = ids.map((id) => new ObjectId(id));

    // Remove image references from adventures
    // Correct approach: pull from multipleImages, and if image field matches any of the IDs, set image to null
    await Adventure.updateMany(
      { multipleImages: { $in: objectIds } },
      { $pullAll: { multipleImages: objectIds } }
    );

    await Adventure.updateMany(
      { image: { $in: objectIds } },
      { $set: { image: null } }
    );

    // Delete images from GridFS
    for (const id of objectIds) {
      try {
        await bucket.delete(id);
      } catch (error) {
        console.error(`Error deleting image ${id} from GridFS:`, error);
      }
    }
    res.json({
      message: "Images deleted successfully and removed from adventures",
    });
  } catch (error: any) {
    // Check if the error is due to ObjectId casting for any of the ids
    if (error instanceof mongoose.Error.CastError) {
      return res
        .status(400)
        .json({ message: "Invalid image ID format in array." });
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Confirm card payment
export const confirmCardPayment = async (req: AuthRequest, res: Response) => {
  try {
    const booking = await AdventureBooking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Verify the booking belongs to the user
    if (booking.user.toString() !== req.user?.id?.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this booking" });
    }

    // Check if payment method is card
    if (booking.paymentMethod !== "card") {
      return res
        .status(400)
        .json({ message: "This booking is not a card payment" });
    }

    // Check if payment is already confirmed
    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ message: "Payment is already confirmed" });
    }

    // Update payment status
    booking.paymentStatus = "paid";
    await booking.save();

    res.json({
      message: "Payment confirmed successfully",
      booking,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Cancel booking (user only, when in pending state)
export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const booking = await AdventureBooking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Verify the booking belongs to the user
    if (booking.user.toString() !== req.user?.id?.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to cancel this booking" });
    }

    // Check if booking is in pending state
    if (booking.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Only pending bookings can be cancelled" });
    }

    // Update booking status to cancelled
    booking.status = "cancelled";
    await booking.save();

    // Update seat availability for the adventure
    const adventure = await Adventure.findById(booking.adventure);
    if (adventure) {
      const bookingDay = new Date(booking.bookingDate)
        .toISOString()
        .split("T")[0];
      if (adventure.seatAvailability[bookingDay]) {
        adventure.seatAvailability[bookingDay].availableSeats +=
          booking.numberOfParticipants;
        await adventure.save();
      }
    }

    res.json({
      message: "Booking cancelled successfully",
      booking,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
