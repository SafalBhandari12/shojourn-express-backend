const mongoose = require("mongoose");

const PendingUserSchema = new mongoose.Schema({
  mobile: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  otp: { type: String, required: true },
  otpExpires: { type: Date, required: true },
});

// Create a virtual property "id" that returns the string version of _id
PendingUserSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

// Ensure virtual fields are serialized.
PendingUserSchema.set("toJSON", {
  virtuals: true,
});

module.exports = mongoose.model("PendingUser", PendingUserSchema);