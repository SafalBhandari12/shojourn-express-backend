import mongoose, { Document, Schema } from "mongoose";
import { Types } from "mongoose";

export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface IOrder extends Document {
  user: Types.ObjectId;
  items: Array<{
    product: Types.ObjectId;
    quantity: number;
    price: number;
    vendor: Types.ObjectId;
  }>;
  totalAmount: number;
  status: OrderStatus;
  shippingAddress: string;
  paymentMethod: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: "LocalMarketProduct",
          required: true,
        },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
        vendor: { type: Schema.Types.ObjectId, ref: "User", required: true },
      },
    ],
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    shippingAddress: { type: String, required: true },
    paymentMethod: { type: String, required: true },
  },
  { timestamps: true }
);

OrderSchema.virtual("id").get(function (this: IOrder) {
  return this._id.toHexString();
});

OrderSchema.set("toJSON", { virtuals: true });

export default mongoose.model<IOrder>("Order", OrderSchema);
