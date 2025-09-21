// backend/routes/activityLogsRoutes.js
import express from "express";
import {
  listAllLogs,
  createLog,
  purgeLogs,
} from "../controllers/activityLogsController.js";
import userAuth from "../middleware/userAuth.js";
import activityLogsModel from "../models/activityLogsModel.js";

const activityLogsRouter = express.Router();

activityLogsRouter.get("/list-all", userAuth, listAllLogs);
activityLogsRouter.post("/create", userAuth, createLog);
activityLogsRouter.post("/purge", userAuth, purgeLogs); // ← new
// activityLogsRoutes.js
activityLogsRouter.get("/latest", async (req, res) => {
  try {
    const logs = await activityLogsModel.find().sort({ timestamp: -1 }); // 🔁 removed .limit(5)

    res.json({ success: true, logs });
  } catch (err) {
    console.error("Error in /latest route:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default activityLogsRouter;
