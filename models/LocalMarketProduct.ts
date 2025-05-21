// Migrated to TypeScript
import mongoose, { Document, Schema, Types } from "mongoose";

export interface ILocalMarketProduct extends Document {
  name: string;
  description?: string;
  detailedDescription?: string;
  price: number;
  image?: string;
  multipleImages?: string[];
  origin?: string;
  usageInstructions?: string;
  careInstructions?: string;
  nutritionalInfo?: string;
  category?: Types.ObjectId;
  rating?: number;
  featured?: boolean;
  vendor: Types.ObjectId;
  stock: number;
  discount: {
    percentage: number;
    validFrom: Date;
    validUntil: Date;
    isActive: boolean;
  };
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const LocalMarketProductSchema = new Schema<ILocalMarketProduct>(
  {
    name: { type: String, required: true },
    description: String,
    detailedDescription: String,
    price: { type: Number, required: true },
    image: String,
    multipleImages: [String],
    origin: String,
    usageInstructions: String,
    careInstructions: String,
    nutritionalInfo: String,
    category: { type: Schema.Types.ObjectId, ref: "Category" },
    rating: {
      type: Number,
      min: 0,
      max: 5,
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
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discount: {
      percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
      validFrom: Date,
      validUntil: Date,
      isActive: {
        type: Boolean,
        default: false,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

LocalMarketProductSchema.virtual("id").get(function (
  this: ILocalMarketProduct
) {
  return this._id.toHexString();
});

LocalMarketProductSchema.set("toJSON", { virtuals: true });

export default mongoose.model<ILocalMarketProduct>(
  "LocalMarketProduct",
  LocalMarketProductSchema
);
