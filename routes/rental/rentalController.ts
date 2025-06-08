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
      availability,
      rentalType,
      make,
      model,
      year,
      transmission,
      fuelType,
      mileage,
      seats,
      doors,
      color,
      licensePlate,
      insurance,
      specifications,
      pricing,
      locationDetails,
    } = req.body;

    // Validate all required fields
    const requiredFields = [
      "title",
      "description",
      "price",
      "category",
      "location",
      "features",
      "availability",
      "rentalType",
      "make",
      "model",
      "year",
      "transmission",
      "fuelType",
      "mileage",
      "seats",
      "doors",
      "color",
      "licensePlate",
      "insurance",
      "pricing",
      "locationDetails",
    ];

    const missingFields = requiredFields.filter((field) => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "Missing required fields",
        details: missingFields.map((field) => `${field} is required`),
      });
    }

    // Validate required document files
    if (!req.files) {
      return res.status(400).json({
        message: "Missing required files",
        details: "Please upload all required documents and images",
      });
    }

    // Log the files for debugging
    console.log("Files received:", Object.keys(req.files));

    // Get the files from req.files
    const files = req.files as { [key: string]: Express.Multer.File[] };

    // Check for required files
    const requiredFiles = ["image", "registration", "insurance", "inspection"];
    const missingFiles = requiredFiles.filter(
      (file) => !files[file] || files[file].length === 0
    );

    if (missingFiles.length > 0) {
      return res.status(400).json({
        message: "Missing required files",
        details: `The following files are required: ${missingFiles.join(", ")}`,
      });
    }

    // Validate document file types
    const allowedDocumentTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "image/jpg",
    ];

    // Get the document files
    const documentFiles = {
      registration: files.registration[0],
      insurance: files.insurance[0],
      inspection: files.inspection[0],
    };

    // Validate file types and sizes
    for (const [docType, file] of Object.entries(documentFiles)) {
      // Check file type
      if (!allowedDocumentTypes.includes(file.mimetype)) {
        return res.status(400).json({
          message: "Invalid file type",
          details: `${docType} must be a PDF, DOC, DOCX, or image file (JPEG, PNG). Received: ${file.mimetype}`,
        });
      }

      // Check file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB in bytes
      if (file.size > maxSize) {
        return res.status(400).json({
          message: "File too large",
          details: `${docType} file size must be less than 10MB. Current size: ${(
            file.size /
            (1024 * 1024)
          ).toFixed(2)}MB`,
        });
      }
    }

    // Validate title
    if (typeof title !== "string" || title.trim().length < 3) {
      return res.status(400).json({
        message: "Invalid title",
        details: "Title must be at least 3 characters long",
      });
    }

    // Validate description
    if (typeof description !== "string" || description.trim().length < 10) {
      return res.status(400).json({
        message: "Invalid description",
        details: "Description must be at least 10 characters long",
      });
    }

    // Validate price
    if (isNaN(Number(price)) || Number(price) <= 0) {
      return res.status(400).json({
        message: "Invalid price",
        details: "Price must be a positive number",
      });
    }

    // Validate category
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({
        message: "Invalid category",
        details: "Category must be a valid ID",
      });
    }

    // Validate location
    if (typeof location !== "string" || location.trim().length < 3) {
      return res.status(400).json({
        message: "Invalid location",
        details: "Location must be at least 3 characters long",
      });
    }

    // Validate rentalType
    const validRentalTypes = ["car", "bike", "equipment"];
    if (!validRentalTypes.includes(rentalType)) {
      return res.status(400).json({
        message: "Invalid rental type",
        details: `Rental type must be one of: ${validRentalTypes.join(", ")}`,
      });
    }

    // Parse and validate features
    let parsedFeatures: string[];
    try {
      parsedFeatures = JSON.parse(features);
      if (!Array.isArray(parsedFeatures) || parsedFeatures.length === 0) {
        throw new Error("Features must be a non-empty array");
      }
      // Validate each feature
      for (const feature of parsedFeatures) {
        if (typeof feature !== "string" || feature.trim().length === 0) {
          throw new Error("Each feature must be a non-empty string");
        }
      }
    } catch (error) {
      return res.status(400).json({
        message: "Invalid features format",
        details:
          error instanceof Error
            ? error.message
            : "Features must be a valid JSON array of non-empty strings",
      });
    }

    // Validate availability (new object format)
    let parsedAvailability: Record<
      string,
      { totalSeats: number; availableSeats: number; price: number }
    >;
    try {
      if (typeof availability === "string") {
        parsedAvailability = JSON.parse(availability);
      } else {
        parsedAvailability = availability;
      }
      if (
        !parsedAvailability ||
        typeof parsedAvailability !== "object" ||
        Array.isArray(parsedAvailability) ||
        Object.keys(parsedAvailability).length === 0
      ) {
        throw new Error("Availability must be a non-empty object");
      }
      // Validate each date entry
      for (const [date, slot] of Object.entries(parsedAvailability)) {
        if (!slot || typeof slot !== "object") {
          throw new Error(`Invalid slot for date ${date}`);
        }
        if (
          typeof slot.totalSeats !== "number" ||
          typeof slot.availableSeats !== "number" ||
          typeof slot.price !== "number"
        ) {
          throw new Error(`Invalid slot values for date ${date}`);
        }
        // Optionally, validate date format
        if (isNaN(Date.parse(date))) {
          throw new Error(`Invalid date key: ${date}`);
        }
      }
    } catch (error) {
      return res.status(400).json({
        message: "Invalid availability format",
        details:
          error instanceof Error
            ? error.message
            : "Availability must be a valid JSON object with date keys",
      });
    }

    // Handle image uploads
    let imageId: ObjectId | null = null;
    let multipleImageIds: ObjectId[] = [];

    try {
      // Handle main image
      const mainImage = req.files["image"][0];
      imageId = await uploadToGridFS(
        mainImage.buffer,
        mainImage.originalname,
        mainImage.mimetype
      );

      // Handle additional images
      if (
        req.files["multipleImages"] &&
        req.files["multipleImages"].length > 0
      ) {
        if (req.files["multipleImages"].length > 5) {
          return res.status(400).json({
            message: "Too many images",
            details: "Maximum 5 additional images allowed",
          });
        }
        for (const file of req.files["multipleImages"]) {
          const id = await uploadToGridFS(
            file.buffer,
            file.originalname,
            file.mimetype
          );
          multipleImageIds.push(id);
        }
      }
    } catch (error) {
      return res.status(400).json({
        message: "Error uploading images",
        details: "Failed to process image uploads",
      });
    }

    // Validate year
    const currentYear = new Date().getFullYear();
    if (
      isNaN(Number(year)) ||
      Number(year) < 1900 ||
      Number(year) > currentYear + 1
    ) {
      return res.status(400).json({
        message: "Invalid year",
        details: `Year must be between 1900 and ${currentYear + 1}`,
      });
    }

    // Validate mileage
    if (isNaN(Number(mileage)) || Number(mileage) < 0) {
      return res.status(400).json({
        message: "Invalid mileage",
        details: "Mileage must be a positive number",
      });
    }

    // Validate seats and doors
    if (isNaN(Number(seats)) || Number(seats) < 1 || Number(seats) > 10) {
      return res.status(400).json({
        message: "Invalid seats",
        details: "Seats must be between 1 and 10",
      });
    }

    if (isNaN(Number(doors)) || Number(doors) < 2 || Number(doors) > 5) {
      return res.status(400).json({
        message: "Invalid doors",
        details: "Doors must be between 2 and 5",
      });
    }

    // Validate insurance
    let parsedInsurance: {
      provider: string;
      policyNumber: string;
      expiryDate: string;
    };
    try {
      console.log("RAW insurance:", insurance);
      if (typeof insurance === "string") {
        parsedInsurance = JSON.parse(insurance);
      } else {
        parsedInsurance = insurance;
      }
      if (
        !parsedInsurance.provider ||
        !parsedInsurance.policyNumber ||
        !parsedInsurance.expiryDate
      ) {
        throw new Error("Missing required insurance fields");
      }
      const expiryDate = new Date(parsedInsurance.expiryDate);
      if (isNaN(expiryDate.getTime())) {
        throw new Error("Invalid insurance expiry date");
      }
    } catch (error) {
      return res.status(400).json({
        message: "Invalid insurance format",
        details:
          error instanceof Error
            ? error.message
            : "Insurance must be a valid JSON object with provider, policyNumber, and expiryDate",
      });
    }

    // Validate specifications (optional)
    let parsedSpecifications: any = undefined;
    if (specifications) {
      try {
        console.log("RAW specifications:", specifications);
        if (typeof specifications === "string") {
          parsedSpecifications = JSON.parse(specifications);
        } else {
          parsedSpecifications = specifications;
        }
        if (parsedSpecifications) {
          if (
            parsedSpecifications.safetyFeatures &&
            !Array.isArray(parsedSpecifications.safetyFeatures)
          ) {
            throw new Error("Safety features must be an array");
          }
        }
      } catch (error) {
        return res.status(400).json({
          message: "Invalid specifications format",
          details:
            error instanceof Error
              ? error.message
              : "Specifications must be a valid JSON object",
        });
      }
    }

    // Validate pricing
    let parsedPricing: any;
    try {
      console.log("RAW pricing:", pricing);
      if (typeof pricing === "string") {
        parsedPricing = JSON.parse(pricing);
      } else {
        parsedPricing = pricing;
      }
      const requiredPricing = [
        "dailyRate",
        "securityDeposit",
        "cancellationPolicy",
      ];
      const missingPricing = requiredPricing.filter(
        (price) => !parsedPricing[price]
      );
      if (missingPricing.length > 0) {
        throw new Error(
          `Missing required pricing fields: ${missingPricing.join(", ")}`
        );
      }
    } catch (error) {
      return res.status(400).json({
        message: "Invalid pricing format",
        details:
          error instanceof Error
            ? error.message
            : "Pricing must be a valid JSON object with dailyRate, securityDeposit, and cancellationPolicy",
      });
    }

    // Validate location details
    let parsedLocationDetails: any;
    try {
      console.log("RAW locationDetails:", locationDetails);
      if (typeof locationDetails === "string") {
        parsedLocationDetails = JSON.parse(locationDetails);
      } else {
        parsedLocationDetails = locationDetails;
      }
      if (
        !parsedLocationDetails.address ||
        !parsedLocationDetails.coordinates
      ) {
        throw new Error("Missing required location details");
      }
      if (
        !parsedLocationDetails.coordinates.latitude ||
        !parsedLocationDetails.coordinates.longitude
      ) {
        throw new Error("Missing coordinates");
      }
      const lat = Number(parsedLocationDetails.coordinates.latitude);
      const lng = Number(parsedLocationDetails.coordinates.longitude);
      if (
        isNaN(lat) ||
        isNaN(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        throw new Error("Invalid coordinates");
      }
    } catch (error) {
      return res.status(400).json({
        message: "Invalid location details format",
        details:
          error instanceof Error
            ? error.message
            : "Location details must be a valid JSON object with address and coordinates",
      });
    }

    // Handle document uploads
    let documentIds: {
      registration: mongoose.Types.ObjectId;
      insurance: mongoose.Types.ObjectId;
      inspection: mongoose.Types.ObjectId;
    };

    try {
      // Upload all documents first
      const [registrationId, insuranceId, inspectionId] = await Promise.all([
        uploadToGridFS(
          documentFiles.registration.buffer,
          documentFiles.registration.originalname,
          documentFiles.registration.mimetype
        ),
        uploadToGridFS(
          documentFiles.insurance.buffer,
          documentFiles.insurance.originalname,
          documentFiles.insurance.mimetype
        ),
        uploadToGridFS(
          documentFiles.inspection.buffer,
          documentFiles.inspection.originalname,
          documentFiles.inspection.mimetype
        ),
      ]);

      // Assign the IDs after successful upload
      documentIds = {
        registration: registrationId,
        insurance: insuranceId,
        inspection: inspectionId,
      };
    } catch (error) {
      // Handle specific upload errors
      if (error instanceof Error) {
        return res.status(400).json({
          message: "Error uploading documents",
          details: `Failed to process document uploads: ${error.message}`,
        });
      }
      return res.status(400).json({
        message: "Error uploading documents",
        details: "Failed to process document uploads. Please try again.",
      });
    }

    // Create rental with all fields
    const rental = new Rental({
      title: title.trim(),
      description: description.trim(),
      price: Number(price),
      category,
      location: location.trim(),
      features: parsedFeatures,
      availability: parsedAvailability,
      rentalType,
      renter: new mongoose.Types.ObjectId(req.user?.id), // Ensure we create a proper ObjectId
      image: imageId,
      images: multipleImageIds,
      make: make.trim(),
      model: model.trim(),
      year: Number(year),
      transmission,
      fuelType,
      mileage: Number(mileage),
      seats: Number(seats),
      doors: Number(doors),
      color: color.trim(),
      licensePlate: licensePlate.trim(),
      insurance: parsedInsurance,
      documents: documentIds,
      specifications: parsedSpecifications,
      pricing: parsedPricing,
      locationDetails: parsedLocationDetails,
      status: "available",
    });

    await rental.save();

    res.status(201).json(addImageUrlsToRental(rental, req));
  } catch (error: any) {
    // Log the full error for debugging
    console.error("Error creating rental:", error);

    // Handle MongoDB validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err: any) => err.message
      );
      return res.status(400).json({
        message: "Validation error",
        details: validationErrors,
      });
    }

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Duplicate entry",
        details: "A rental with this title already exists",
      });
    }

    // Handle other errors with more details
    res.status(500).json({
      message: "Error creating rental",
      details: error.message || "An unexpected error occurred",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
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
    console.log("Debug - User ID:", userId);
    console.log("Debug - Renter ID:", renterId);
    console.log("Debug - User Role:", req.user?.role);

    // Fix: Check if user is either the renter OR an admin
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
    const availability = req.body.availability
      ? JSON.parse(req.body.availability)
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
      availability,
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
    };

    // Remove undefined fields
    Object.keys(updateFields).forEach((key) => {
      if (updateFields[key as keyof typeof updateFields] === undefined) {
        delete updateFields[key as keyof typeof updateFields];
      }
    });

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
    console.error("Error updating rental:", error);

    if (error instanceof SyntaxError) {
      return res.status(400).json({
        message: "Invalid JSON format",
        details: "One or more JSON fields are not properly formatted",
      });
    }

    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ValidationError" &&
      "errors" in error
    ) {
      const validationErrors = Object.values(
        (error as { errors: Record<string, { message: string }> }).errors
      ).map((err) => err.message);
      return res.status(400).json({
        message: "Validation error",
        details: validationErrors,
      });
    }

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
    console.error("Error fetching rental:", error);
    res.status(500).json({
      message: "Error fetching rental",
      details: "An unexpected error occurred while fetching the rental",
    });
  }
};

// Get all rentals
export const getAllRentals = async (req: Request, res: Response) => {
  try {
    // Filtering and pagination logic can be added here later
    const rentals = await Rental.find()
      .populate("renter", "name")
      .populate("category", "name");

    // Use the helper for each rental to add image URLs and apply toObject/toJSON
    const rentalsWithUrls = rentals.map((rental) =>
      addImageUrlsToRental(rental, req)
    );

    console.log(
      "getAllRentals - First Raw Mongoose Document (if any):",
      rentals[0]
    );
    console.log(
      "getAllRentals - First After addImageUrlsToRental (if any):",
      rentalsWithUrls[0]
    );

    res.json(rentalsWithUrls);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
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

    // Use the helper for each rental to add image URLs and apply toObject/toJSON
    const rentalsWithUrls = rentals.map((rental) =>
      addImageUrlsToRental(rental, req)
    );

    console.log(
      "getRenterRentals - First Raw Mongoose Document (if any):",
      rentals[0]
    );
    console.log(
      "getRenterRentals - First After addImageUrlsToRental (if any):",
      rentalsWithUrls[0]
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

      // Check if the rental is available for the specific time slot
      const dateStr = bookingStartDate.toISOString().split("T")[0];
      const slot = rental.availability[dateStr];
      if (!slot || slot.availableSeats < 1) {
        return res
          .status(400)
          .json({ message: `No availability for date: ${dateStr}` });
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

      // Update rental availability
      rental.availability[dateStr].availableSeats -= 1;
      await rental.save();

      res.status(201).json(booking);
    } else if (bookingType === "daily") {
      // Calculate total days
      const totalDays = calculateDays(bookingStartDate, bookingEndDate);

      // Check availability for all days
      const bookingDates: string[] = [];
      let current = new Date(bookingStartDate);
      while (current <= bookingEndDate) {
        const dateStr = current.toISOString().split("T")[0];
        bookingDates.push(dateStr);
        current.setDate(current.getDate() + 1);
      }

      // Check if all dates are available
      for (const date of bookingDates) {
        const slot = rental.availability[date];
        if (!slot || slot.availableSeats < 1) {
          return res
            .status(400)
            .json({ message: `No availability for date: ${date}` });
        }
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

      // Update rental availability for all days
      for (const date of bookingDates) {
        rental.availability[date].availableSeats -= 1;
      }
      await rental.save();

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
    console.error("Error fetching all bookings:", error);
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
    console.error("Error cancelling booking:", error);
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
    console.error("Error rating rental:", error);
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
