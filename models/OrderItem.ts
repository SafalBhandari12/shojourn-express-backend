import mongoose, { Document, Schema } from "mongoose";
import { Types } from "mongoose";

export interface IOrderItem extends Document {
  order: Types.ObjectId;
  product: Types.ObjectId;
  quantity: number;
  price: number;
  vendor: Types.ObjectId;
  finalPrice: number;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "LocalMarketProduct",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    finalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

OrderItemSchema.virtual("id").get(function (this: IOrderItem) {
  return this._id.toHexString();
});

OrderItemSchema.set("toJSON", { virtuals: true });

export default mongoose.model<IOrderItem>("OrderItem", OrderItemSchema);
