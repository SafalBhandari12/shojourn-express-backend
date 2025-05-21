// Migrated to TypeScript
import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import PendingUser from "../models/PendingUser";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

// Set up the Twilio client with credentials from env variables
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID as string,
  process.env.TWILIO_AUTH_TOKEN as string
);

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/mobile - For login OTP generation
router.post("/mobile", async (req: Request, res: Response): Promise<void> => {
  const { mobile } = req.body;
  if (!mobile) {
    res.status(400).json({ msg: "Mobile number is required" });
    return;
  }
  try {
    const user = await User.findOne({ mobile });
    if (user) {
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      await client.messages.create({
        body: `Your login verification code is: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER as string,
        to: mobile,
      });
      res.status(200).json({ msg: "OTP sent to your mobile" });
    } else {
      res.status(404).json({
        msg: "Mobile number not registered.",
        suggestedEndpoint: "/api/auth/register",
      });
    }
  } catch (err: any) {
    console.error("Error in /mobile:", err.message);
    res.status(500).send("Server error");
  }
});

// POST /api/auth/register - Initiates a new user registration
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const { mobile, name, address } = req.body;
  if (!mobile || !name || !address) {
    res.status(400).json({ msg: "Mobile, name, and address are required" });
    return;
  }
  try {
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      res.status(400).json({ msg: "User already registered. Please login." });
      return;
    }

    let pendingUser = await PendingUser.findOne({ mobile });
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    if (pendingUser) {
      pendingUser.name = name;
      pendingUser.address = address;
      pendingUser.otp = otp;
      pendingUser.otpExpires = otpExpires;
      await pendingUser.save();
    } else {
      pendingUser = new PendingUser({
        mobile,
        name,
        address,
        otp,
        otpExpires,
      });
      await pendingUser.save();
    }

    await client.messages.create({
      body: `Your registration verification code is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER as string,
      to: mobile,
    });

    res
      .status(201)
      .json({ msg: "Registration initiated. OTP sent to your mobile" });
  } catch (err: any) {
    console.error("Error in /register:", err.message);
    res.status(500).send("Server error");
  }
});

// POST /api/auth/register/verify - Verifies the OTP for a pending registration
router.post(
  "/register/verify",
  async (req: Request, res: Response): Promise<void> => {
    const { mobile, otp } = req.body;
    if (!mobile || !otp) {
      res.status(400).json({ msg: "Mobile and OTP are required" });
      return;
    }
    try {
      const pendingUser = await PendingUser.findOne({ mobile });
      if (!pendingUser) {
        res
          .status(400)
          .json({ msg: "No registration pending for this mobile" });
        return;
      }
      if (pendingUser.otp !== otp || pendingUser.otpExpires < new Date()) {
        res.status(400).json({ msg: "Invalid or expired OTP" });
        return;
      }

      const newUser = new User({
        mobile: pendingUser.mobile,
        name: pendingUser.name,
        address: pendingUser.address,
        isVerified: true,
      });
      await newUser.save();

      await PendingUser.deleteOne({ mobile });

      const payload = {
        user: {
          id: newUser._id,
          role: newUser.role,
        },
      };

      jwt.sign(
        payload,
        process.env.JWT_SECRET as string,
        { expiresIn: "100h" },
        (err: Error | null, token: string | undefined) => {
          if (err) throw err;
          res.status(200).json({ token });
        }
      );
    } catch (err: any) {
      console.error("Error in /register/verify:", err.message);
      res.status(500).send("Server error");
    }
  }
);

// POST /api/auth/verify - For login OTP verification for existing users
router.post("/verify", async (req: Request, res: Response): Promise<void> => {
  const { mobile, otp } = req.body;
  if (!mobile || !otp) {
    res.status(400).json({ msg: "Mobile and OTP are required" });
    return;
  }
  try {
    const user = await User.findOne({ mobile });
    if (!user) {
      res.status(400).json({ msg: "User not found" });
      return;
    }
    if (user.otp !== otp || (user.otpExpires && user.otpExpires < new Date())) {
      res.status(400).json({ msg: "Invalid or expired OTP" });
      return;
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const payload = {
      user: {
        id: user._id,
        role: user.role,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET as string,
      { expiresIn: "100h" },
      (err: Error | null, token: string | undefined) => {
        if (err) throw err;
        res.status(200).json({ token });
      }
    );
  } catch (err: any) {
    console.error("Error in /verify:", err.message);
    res.status(500).send("Server error");
  }
});

export default router;
