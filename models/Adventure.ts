import mongoose, { Document, Schema, Types } from "mongoose";

export interface IAdventure extends Document {
  name: string;
  description: string;
  detailedDescription?: string;
  price: number;
  image?: string;
  multipleImages?: string[];
  location: string;
  duration: string;
  difficulty: "Easy" | "Medium" | "Hard" | "Extreme";
  ageRestriction?: {
    minAge: number;
    maxAge?: number;
  };
  requirements?: string[];
  safetyInstructions: string;
  category: mongoose.Types.ObjectId;
  rating?: number;
  featured?: boolean;
  vendor: mongoose.Types.ObjectId;
  maxParticipants: number;
  currentBookings: number;
  discount: {
    isActive: boolean;
    percentage: number;
    validFrom: Date;
    validUntil: Date;
    originalPrice: number;
  };
  seatAvailability: {
    [key: string]: {
      totalSeats: number;
      availableSeats: number;
      price?: number;
    };
  };
  isActive: boolean;
  bookedBy: number;
  schedule: {
    startTime: string;
    endTime: string;
    daysAvailable: string[];
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const AdventureSchema = new Schema<IAdventure>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    detailedDescription: String,
    price: { type: Number, required: true, min: 0 },
    image: String,
    multipleImages: [String],
    location: { type: String, required: true },
    duration: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard", "Extreme"],
      required: true,
    },
    ageRestriction: {
      minAge: { type: Number, required: true },
      maxAge: Number,
    },
    requirements: [String],
    safetyInstructions: { type: String, required: true },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      select: false,
      default: 0,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    maxParticipants: { type: Number, required: true, min: 1 },
    currentBookings: { type: Number, default: 0 },
    discount: {
      isActive: { type: Boolean, default: false },
      percentage: { type: Number, min: 0, max: 100, default: 0 },
      validFrom: { type: Date },
      validUntil: { type: Date },
      originalPrice: { type: Number },
    },
    seatAvailability: {
      type: Object,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    bookedBy: {
      type: Number,
      default: 0,
    },
    schedule: {
      startTime: { type: String, required: true },
      endTime: { type: String, required: true },
      daysAvailable: [{ type: String, required: true }],
    },
  },
  { timestamps: true }
);

// Create indexes
AdventureSchema.index({ name: 1 });
AdventureSchema.index({ category: 1 });
AdventureSchema.index({ vendor: 1 });
AdventureSchema.index({ "discount.isActive": 1 });
AdventureSchema.index({ location: 1 });
AdventureSchema.index({ difficulty: 1 });
AdventureSchema.index({ "discount.validUntil": 1 });

// Middleware to automatically update discount status
AdventureSchema.pre("save", function (next) {
  if (this.discount && this.discount.validUntil) {
    this.discount.isActive = new Date() <= this.discount.validUntil;
  }
  next();
});

// Method to calculate discounted price
AdventureSchema.methods.getDiscountedPrice = function (day: string): number {
  if (!this.discount.isActive) {
    return this.seatAvailability[day]?.price || this.price;
  }

  const basePrice = this.seatAvailability[day]?.price || this.price;
  const discountAmount = (basePrice * this.discount.percentage) / 100;
  return basePrice - discountAmount;
};

// Method to check seat availability
AdventureSchema.methods.checkSeatAvailability = function (
  day: string,
  quantity: number
): boolean {
  const dayAvailability = this.seatAvailability[day];
  if (!dayAvailability) return false;
  return dayAvailability.availableSeats >= quantity;
};

// Method to update seat availability
AdventureSchema.methods.updateSeatAvailability = function (
  day: string,
  quantity: number
): boolean {
  const dayAvailability = this.seatAvailability[day];
  if (!dayAvailability || dayAvailability.availableSeats < quantity)
    return false;

  dayAvailability.availableSeats -= quantity;
  this.seatAvailability[day] = dayAvailability;
  return true;
};

AdventureSchema.virtual("id").get(function (this: IAdventure) {
  return this._id.toHexString();
});

AdventureSchema.set("toJSON", { virtuals: true });

export default mongoose.model<IAdventure>("Adventure", AdventureSchema);
