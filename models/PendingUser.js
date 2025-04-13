const mongoose = require("mongoose");

const PendingUserSchema = new mongoose.Schema({
  mobile: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  otp: { type: String, required: true },
  otpExpires: { type: Date, required: true },
});

module.exports = mongoose.model("PendingUser", PendingUserSchema);