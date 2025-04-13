const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String, // Additional detail for new registrations
    },
    address: {
      type: String, // Additional detail for new registrations
    },
    // The password field is optional in an OTP-based flow but kept here for possible future extension.
    password: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
    },
    otpExpires: {
      type: Date,
    },
    role: {
      type: String,
      enum: ["client", "admin"],
      default: "client",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);