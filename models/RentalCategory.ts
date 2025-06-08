import mongoose, { Schema, Document } from "mongoose";

export interface IRentalCategory extends Document {
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const rentalCategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
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

export default mongoose.model<IRentalCategory>(
  "RentalCategory",
  rentalCategorySchema
);
