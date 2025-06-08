import mongoose, { Document, Schema } from "mongoose";

export interface IRentalBooking extends Document {
  rental: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  bookingType: "hourly" | "daily";
  startDate: Date;
  endDate: Date;
  startTime?: string; // Format: "HH:mm"
  endTime?: string; // Format: "HH:mm"
  totalHours?: number;
  totalDays?: number;
  totalPrice: number;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  paymentStatus: "pending" | "paid" | "refunded";
  paymentMethod: "cash" | "card";
  createdAt: Date;
  updatedAt: Date;
}

export interface IPopulatedRentalBooking
  extends Omit<IRentalBooking, "rental" | "user"> {
  rental: {
    id: string;
    title: string;
    price: number;
    imageUrl?: string | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
}

const rentalBookingSchema = new Schema<IRentalBooking>(
  {
    rental: {
      type: Schema.Types.ObjectId,
      ref: "Rental",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bookingType: {
      type: String,
      required: true,
      enum: ["hourly", "daily"],
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      validate: {
        validator: function (v: string) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: (props) => `${props.value} is not a valid time format (HH:mm)`,
      },
    },
    endTime: {
      type: String,
      validate: {
        validator: function (v: string) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: (props) => `${props.value} is not a valid time format (HH:mm)`,
      },
    },
    totalHours: {
      type: Number,
      min: 0,
    },
    totalDays: {
      type: Number,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["cash", "card"],
      default: "cash",
    },
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

// Index for better query performance
rentalBookingSchema.index({ rental: 1, user: 1 });
rentalBookingSchema.index({ status: 1 });
rentalBookingSchema.index({ paymentStatus: 1 });
rentalBookingSchema.index({ startDate: 1, endDate: 1 });

export default mongoose.model<IRentalBooking>(
  "RentalBooking",
  rentalBookingSchema
);
