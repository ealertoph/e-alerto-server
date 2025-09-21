import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  employeeNumber: { type: String, unique: true, index: true },
  district: {
    type: String,
    enum: [
      "District 1",
      "District 2",
      "District 3",
      "District 4",
      "District 5",
      "District 6",
      "Central Comm",
    ],
    required: true,
  },
  surname: { type: String, required: true },
  firstName: { type: String, required: true },
  middleName: { type: String, default: "" }, // optional
  suffix: { type: String, default: "" }, // optional
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  position: {
    type: String,
    enum: ["Super Admin", "Admin", "District Engineer"],
    required: true,
  },
  phone: { type: String, required: true },
  verifyOtp: { type: String, default: "" },
  verifyOtpExpireAt: { type: Number, default: 0 },
  isAccountVerified: { type: Boolean, default: false },
  resetOtp: { type: String, default: "" },
  resetOtpExpireAt: { type: Number, default: 0 },

  // ✅ NEW FIELDS
  status: {
    type: String,
    enum: ["Active", "Inactive"],
    default: "Active",
  },
  archive: {
    type: Boolean,
    default: false,
  },
  profilePic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "profile.files",
    default: null,
  },
  originalFileName: { type: String, default: null }, // optional but helpful
});

export default mongoose.models.employees ||
  mongoose.model("employees", userSchema);
