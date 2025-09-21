// backend/models/activityLogsModel.js
import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    logNumber: {
      type: String,
      unique: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "employees",
      required: true,
    },
    employeeNumber: {
      type: String,
      required: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    entityType: {
      type: String,
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null,
    },
    displayId: {
      type: String,
      default: null, // reportNumber, assignmentNumber, etc.
    },
    action: {
      type: String,
      required: true,
    },
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    macAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.activitylogs ||
  mongoose.model("activitylogs", activityLogSchema);
