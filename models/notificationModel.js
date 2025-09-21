// models/notificationModel.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "employees",
      required: true,
    },
    recipients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "employees",
      },
    ],
    entityType: {
      type: String,
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    displayId: {
      type: String,
    },
    action: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    isReadBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "employees" },
        readAt: { type: Date },
      },
    ],
  },
  { timestamps: true }
);

const notificationModel =
  mongoose.models.notifications_web ||
  mongoose.model("notifications_web", notificationSchema);

export default notificationModel;
