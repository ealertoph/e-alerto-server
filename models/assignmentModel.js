// models/assignmentModel.js
import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema(
  {
    reportNumber: {
      type: String,
      ref: "reports", // Use reportNumber instead of _id
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    // New: human-readable job order number
    assignmentNumber: {
      type: String,
      unique: true,
      index: true,
    },
    // New fields for completion workflow
    siteInspectionReport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "uploads.files",
      default: null,
    },
    originalFileName: {
      type: String,
      default: null,
    },
    accomplishmentDate: {
      type: Date,
      default: null,
    },
    archive: { type: Boolean, default: false }, // ✅ NEW FIELD
    remarks: { type: String, default: "" }, // uploader's comment
  },
  { timestamps: true }
);

const Assignment =
  mongoose.models.assignments ||
  mongoose.model("assignments", assignmentSchema);
export default Assignment;
