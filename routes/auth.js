require("dotenv").config();
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const PendingUser = require("../models/PendingUser");
const twilio = require("twilio");

// Set up the Twilio client with credentials from env variables.
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Utility: Generate a random 6-digit OTP as a string.
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/*
  POST /api/auth/mobile
  Purpose: For login OTP generation.
    - If the mobile is registered, generate an OTP, update the user record, and send the OTP via Twilio.
    - If the mobile is NOT registered, return a 404 with a suggested registration endpoint.
*/
router.post("/mobile", async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) {
    return res.status(400).json({ msg: "Mobile number is required" });
  }
  try {
    const user = await User.findOne({ mobile });
    if (user) {
      // Generate an OTP valid for 10 minutes.
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpires = Date.now() + 10 * 60 * 1000;
      await user.save();

      // Send the OTP SMS via Twilio.
      await client.messages.create({
        body: `Your login verification code is: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: mobile, // Ensure the mobile includes the country code.
      });
      return res.status(200).json({ msg: "OTP sent to your mobile" });
    } else {
      // Mobile number not registered: instruct the frontend to use the registration endpoint.
      return res.status(404).json({
        msg: "Mobile number not registered.",
        suggestedEndpoint: "/api/auth/register",
      });
    }
  } catch (err) {
    console.error("Error in /mobile:", err.message);
    res.status(500).send("Server error");
  }
});

/*
  POST /api/auth/register
  Purpose: Initiates a new user registration.
    - Stores user details in the PendingUser collection along with an OTP.
    - The user is not permanently registered until OTP verification.
*/
router.post("/register", async (req, res) => {
  const { mobile, name, address } = req.body;
  if (!mobile || !name || !address) {
    return res
      .status(400)
      .json({ msg: "Mobile, name, and address are required" });
  }
  try {
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res
        .status(400)
        .json({ msg: "User already registered. Please login." });
    }

    // Check for an existing pending registration.
    let pendingUser = await PendingUser.findOne({ mobile });
    const otp = generateOTP();
    const otpExpires = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes.

    if (pendingUser) {
      // Update existing pending registration.
      pendingUser.name = name;
      pendingUser.address = address;
      pendingUser.otp = otp;
      pendingUser.otpExpires = otpExpires;
      await pendingUser.save();
    } else {
      // Create a new pending registration record.
      pendingUser = new PendingUser({
        mobile,
        name,
        address,
        otp,
        otpExpires,
      });
      await pendingUser.save();
    }

    // Send the OTP SMS via Twilio.
    await client.messages.create({
      body: `Your registration verification code is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: mobile,
    });

    res
      .status(201)
      .json({ msg: "Registration initiated. OTP sent to your mobile" });
  } catch (err) {
    console.error("Error in /register:", err.message);
    res.status(500).send("Server error");
  }
});

/*
  POST /api/auth/register/verify
  Purpose: Verifies the OTP for a pending registration.
    - If valid, creates a new permanent user record and returns a JWT token.
    - The pending registration record is removed afterwards.
*/
router.post("/register/verify", async (req, res) => {
  const { mobile, otp } = req.body;
  if (!mobile || !otp) {
    return res.status(400).json({ msg: "Mobile and OTP are required" });
  }
  try {
    const pendingUser = await PendingUser.findOne({ mobile });
    if (!pendingUser) {
      return res
        .status(400)
        .json({ msg: "No registration pending for this mobile" });
    }
    if (pendingUser.otp !== otp || pendingUser.otpExpires < Date.now()) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    // OTP verified – create a permanent user record.
    const newUser = new User({
      mobile: pendingUser.mobile,
      name: pendingUser.name,
      address: pendingUser.address,
      isVerified: true,
    });
    await newUser.save();

    // Remove the pending registration.
    await PendingUser.deleteOne({ mobile });

    // Generate JWT token.
    const payload = {
      user: {
        id: newUser._id,
        role: newUser.role,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
      (err, token) => {
        if (err) throw err;
        res.status(200).json({ token });
      }
    );
  } catch (err) {
    console.error("Error in /register/verify:", err.message);
    res.status(500).send("Server error");
  }
});

/*
  POST /api/auth/verify
  Purpose: For login OTP verification for existing users.
    - Verifies OTP, marks the user as verified, and returns a JWT token.
*/
router.post("/verify", async (req, res) => {
  const { mobile, otp } = req.body;
  if (!mobile || !otp) {
    return res.status(400).json({ msg: "Mobile and OTP are required" });
  }
  try {
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(400).json({ msg: "User not found" });
    }
    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    // OTP verified – update the user record.
    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    // Generate JWT token.
    const payload = {
      user: {
        id: user._id,
        role: user.role,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
      (err, token) => {
        if (err) throw err;
        res.status(200).json({ token });
      }
    );
  } catch (err) {
    console.error("Error in /verify:", err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;