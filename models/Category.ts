// Migrated to TypeScript
import mongoose, { Document, Schema } from "mongoose";

export interface ICategory extends Document {
  name: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

CategorySchema.virtual("id").get(function (this: ICategory) {
  return this._id.toHexString();
});

CategorySchema.set("toJSON", { virtuals: true });

export default mongoose.model<ICategory>("Category", CategorySchema);
