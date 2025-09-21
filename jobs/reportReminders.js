import cron from "node-cron";
import reportModel from "../models/reportModel.js";
import userModel from "../models/userModel.js";
import notificationModel from "../models/notificationModel.js";
import mongoose from "mongoose";
import { io, userSocketMap } from "../server.js";

// Philippine Time offset
const PH_OFFSET = 8 * 60; // UTC+8 in minutes

cron.schedule("0 * * * *", async () => {
  // every hour
  try {
    const now = new Date();

    // Adjust for Philippine time
    const nowPH = new Date(now.getTime() + PH_OFFSET * 60 * 1000);

    // Calculate 3-day and 10-day thresholds
    const threeDaysAgo = new Date(nowPH.getTime() - 3 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(nowPH.getTime() - 10 * 24 * 60 * 60 * 1000);

    // Find reports that are Submitted and need reminders
    const reports = await reportModel
      .find({
        status: "Submitted",
        $or: [
          {
            timestamp: { $lte: threeDaysAgo },
            remindersSent: { $ne: "3days" },
          },
          {
            timestamp: { $lte: tenDaysAgo },
            remindersSent: { $ne: "10days" },
          },
        ],
      })
      .lean();

    for (const report of reports) {
      // Determine which reminder
      let reminderType = "";
      if (
        !report.remindersSent?.includes("3days") &&
        new Date(report.timestamp) <= threeDaysAgo
      ) {
        reminderType = "3days";
      } else if (
        !report.remindersSent?.includes("10days") &&
        new Date(report.timestamp) <= tenDaysAgo
      ) {
        reminderType = "10days";
      } else {
        continue; // already reminded
      }

      const admins = await userModel
        .find({
          position: { $in: ["Admin", "Super Admin"] },
          status: "Active",
          archive: false,
        })
        .select("_id")
        .lean();

      const recipientIds = admins.map((a) => a._id.toString());

      if (!recipientIds.length) continue;

      let message = "";
      if (reminderType === "3days") {
        message = `Reminder: Report ${report.reportNumber} was submitted 3 days ago.`;
      } else if (reminderType === "10days") {
        message = `Reminder: Report ${report.reportNumber} requires site inspection and report submission (submitted 10 days ago).`;
      }

      const notifDoc = await notificationModel.create({
        sender: null, // system
        recipients: recipientIds.map((id) => new mongoose.Types.ObjectId(id)),
        entityType: "Report",
        entityId: report._id,
        displayId: report.reportNumber,
        action: "reminder",
        message,
      });

      // Emit via sockets
      for (const rId of recipientIds) {
        const sid = userSocketMap[rId.toString()];
        if (sid)
          io.to(sid).emit("newNotification", {
            ...notifDoc.toObject(),
            date: notifDoc.createdAt,
          });
      }

      // Update report to mark reminder sent
      await reportModel.findByIdAndUpdate(report._id, {
        $push: { remindersSent: reminderType },
      });
    }

    if (reports.length) {
      console.log(`System reminders sent for ${reports.length} report(s).`);
    }
  } catch (err) {
    console.error("Error in report reminder cron job:", err);
  }
});
