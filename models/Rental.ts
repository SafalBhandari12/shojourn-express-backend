import mongoose, { Schema } from "mongoose";

export interface IRental {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  price: number;
  category: mongoose.Types.ObjectId;
  location: string;
  features: string[];
  availability: {
    [date: string]: {
      totalSeats: number;
      availableSeats: number;
      price: number;
    };
  };
  rentalType: "car" | "bike" | "equipment";
  image?: mongoose.Types.ObjectId;
  images?: mongoose.Types.ObjectId[];
  renter: mongoose.Types.ObjectId;
  ratings: {
    user: mongoose.Types.ObjectId;
    rating: number;
    review: string;
  }[];
  averageRating: number;
  // Car-specific fields
  make: string;
  model: string;
  year: number;
  transmission: "automatic" | "manual";
  fuelType: "petrol" | "diesel" | "electric" | "hybrid";
  mileage: number;
  seats: number;
  doors: number;
  color: string;
  licensePlate: string;
  insurance: {
    provider: string;
    policyNumber: string;
    expiryDate: Date;
  };
  documents: {
    registration: mongoose.Types.ObjectId;
    insurance: mongoose.Types.ObjectId;
    inspection: mongoose.Types.ObjectId;
  };
  specifications?: {
    engine: string;
    power: string;
    fuelEfficiency: string;
    bootSpace: string;
    airbags: number;
    safetyFeatures: string[];
  };
  pricing: {
    dailyRate: number;
    hourlyRate: number;
    minimumHours: number;
    securityDeposit: number;
    cancellationPolicy: string;
  };
  locationDetails: {
    address: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  status: "available" | "unavailable" | "maintenance";
  maintenanceHistory: {
    date: Date;
    description: string;
    cost: number;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

// Interface for the rental object with URLs
export interface IRentalWithUrls extends Omit<IRental, "image" | "images"> {
  imageUrl: string | null;
  multipleImageUrls: string[];
}

const rentalSchema = new Schema<IRental>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "RentalCategory",
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    features: [
      {
        type: String,
        required: true,
      },
    ],
    availability: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    rentalType: {
      type: String,
      required: true,
      enum: ["car", "bike", "equipment"],
    },
    image: {
      type: Schema.Types.ObjectId,
    },
    images: [
      {
        type: Schema.Types.ObjectId,
      },
    ],
    renter: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ratings: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        review: {
          type: String,
        },
      },
    ],
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    make: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    transmission: {
      type: String,
      enum: ["automatic", "manual"],
      required: true,
    },
    fuelType: {
      type: String,
      enum: ["petrol", "diesel", "electric", "hybrid"],
      required: true,
    },
    mileage: {
      type: Number,
      required: true,
    },
    seats: {
      type: Number,
      required: true,
    },
    doors: {
      type: Number,
      required: true,
    },
    color: {
      type: String,
      required: true,
    },
    licensePlate: {
      type: String,
      required: true,
    },
    insurance: {
      provider: {
        type: String,
        required: true,
      },
      policyNumber: {
        type: String,
        required: true,
      },
      expiryDate: {
        type: Date,
        required: true,
      },
    },
    documents: {
      registration: {
        type: Schema.Types.ObjectId,
        required: true,
      },
      insurance: {
        type: Schema.Types.ObjectId,
        required: true,
      },
      inspection: {
        type: Schema.Types.ObjectId,
        required: true,
      },
    },
    specifications: {
      engine: {
        type: String,
      },
      power: {
        type: String,
      },
      fuelEfficiency: {
        type: String,
      },
      bootSpace: {
        type: String,
      },
      airbags: {
        type: Number,
      },
      safetyFeatures: [
        {
          type: String,
        },
      ],
    },
    pricing: {
      dailyRate: {
        type: Number,
        required: true,
      },
      hourlyRate: {
        type: Number,
        required: true,
      },
      minimumHours: {
        type: Number,
        required: true,
        default: 4,
      },
      securityDeposit: {
        type: Number,
        required: true,
      },
      cancellationPolicy: {
        type: String,
        required: true,
      },
    },
    locationDetails: {
      address: {
        type: String,
        required: true,
      },
      coordinates: {
        latitude: {
          type: Number,
          required: true,
        },
        longitude: {
          type: Number,
          required: true,
        },
      },
    },
    status: {
      type: String,
      enum: ["available", "unavailable", "maintenance"],
      default: "available",
    },
    maintenanceHistory: [
      {
        date: {
          type: Date,
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
        cost: {
          type: Number,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Index for better search performance
rentalSchema.index({ title: "text", description: "text", location: "text" });

export default mongoose.model<IRental>("Rental", rentalSchema);
