import mongoose from "mongoose";

const regUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  full_name: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, required: true },
  otpToken: { type: String, default: null },
  otpExpiresAt: { type: Date, default: null },
  verified: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  oneSignalPlayerId: { type: String, default: null },
});

const regUserModel =
  mongoose.models.users || mongoose.model("users", regUserSchema); // uses 'users' collection

export default regUserModel;
