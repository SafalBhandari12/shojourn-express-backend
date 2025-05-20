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
    rating: Number,
    featured: Boolean,
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
