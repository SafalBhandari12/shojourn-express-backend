import mongoose from "mongoose";

const NotifyEmailSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
});

export default mongoose.model("NotifyEmail", NotifyEmailSchema);
