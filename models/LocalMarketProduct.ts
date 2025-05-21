// Migrated to TypeScript
import mongoose, { Document, Schema, Types } from "mongoose";

export interface ILocalMarketProduct extends Document {
  name: string;
  description: string;
  detailedDescription?: string;
  price: number;
  image?: string;
  multipleImages?: string[];
  origin?: string;
  usageInstructions?: string;
  careInstructions?: string;
  nutritionalInfo?: string;
  category: mongoose.Types.ObjectId;
  rating?: number;
  featured?: boolean;
  vendor: mongoose.Types.ObjectId;
  stock: number;
  discount: {
    isActive: boolean;
    percentage: number;
    validFrom: Date;
    validUntil: Date;
  };
  images: string[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const LocalMarketProductSchema = new Schema<ILocalMarketProduct>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    detailedDescription: String,
    price: { type: Number, required: true, min: 0 },
    image: String,
    multipleImages: [String],
    origin: String,
    usageInstructions: String,
    careInstructions: String,
    nutritionalInfo: String,
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
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
    stock: { type: Number, required: true, min: 0 },
    discount: {
      isActive: { type: Boolean, default: false },
      percentage: { type: Number, min: 0, max: 100, default: 0 },
      validFrom: { type: Date },
      validUntil: { type: Date },
    },
    images: [{ type: String }],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Create indexes
LocalMarketProductSchema.index({ name: 1 });
LocalMarketProductSchema.index({ category: 1 });
LocalMarketProductSchema.index({ vendor: 1 });
LocalMarketProductSchema.index({ "discount.isActive": 1 });

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
