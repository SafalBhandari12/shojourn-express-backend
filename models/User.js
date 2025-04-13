const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
    },
    address: {
      type: String,
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

// Create a virtual property "id" that returns the string version of _id
UserSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

// Ensure virtual fields are serialized to JSON.
UserSchema.set("toJSON", {
  virtuals: true,
});

module.exports = mongoose.model("User", UserSchema);