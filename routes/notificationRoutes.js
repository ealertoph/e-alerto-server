// routes/notificationRoutes.js
import express from "express";
import notificationModel from "../models/notificationModel.js";
import userAuth from "../middleware/userAuth.js";

const notificationRouter = express.Router();

// GET /api/notifications
notificationRouter.get("/", userAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const notifications = await notificationModel
      .find({ recipients: userId })
      .sort({ createdAt: -1 })
      .lean();

    const mapped = notifications.map((n) => ({
      ...n,
      date: n.createdAt,
    }));

    res.json({ success: true, notifications: mapped });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching notifications" });
  }
});

// PUT /api/notifications/mark-read
notificationRouter.put("/mark-read", userAuth, async (req, res) => {
  try {
    const userId = req.userId;
    await notificationModel.updateMany(
      { recipients: userId, "isReadBy.userId": { $ne: userId } },
      { $addToSet: { isReadBy: { userId, readAt: new Date() } } }
    );

    res
      .status(200)
      .json({ success: true, message: "Notifications marked as read." });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Server error marking notifications as read.",
      });
  }
});

// PUT /api/notifications/mark-one/:id
notificationRouter.put("/mark-one/:id", userAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const updated = await notificationModel.findOneAndUpdate(
      { _id: id, recipients: userId, "isReadBy.userId": { $ne: userId } },
      { $addToSet: { isReadBy: { userId, readAt: new Date() } } },
      { new: true }
    );

    if (!updated) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Notification not found or already read.",
        });
    }

    res.json({ success: true, notification: updated });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res
      .status(500)
      .json({ success: false, message: "Error marking notification as read." });
  }
});

export default notificationRouter;
