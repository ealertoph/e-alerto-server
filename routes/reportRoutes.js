import express from "express";
import mongoose from "mongoose";
import userAuth from "../middleware/userAuth.js";
import {
  listAllReports,
  getOneReport,
  createReport,
  updateReport,
  deleteReport,
  getReportAnalytics,
  getStatusAnalytics,
  getStatusCounts,
  getDupaAnalytics,
  getTotalDupaCost,
} from "../controllers/reportController.js";

const reportRouter = express.Router();

reportRouter.get("/list-all", userAuth, listAllReports);
reportRouter.get("/get/:id", userAuth, getOneReport);
reportRouter.post("/create", userAuth, createReport);
reportRouter.put("/update/:id", userAuth, updateReport);
reportRouter.delete("/delete/:id", userAuth, deleteReport);
reportRouter.get("/analytics", getReportAnalytics);
reportRouter.get("/analytics/status", getStatusAnalytics);
reportRouter.get("/analytics/status-counts", getStatusCounts);
reportRouter.get("/analytics/dupa", userAuth, getDupaAnalytics);
// Add the route for getting the total DUPA cost
reportRouter.get("/total-cost", getTotalDupaCost);
reportRouter.get("/image/:id", (req, res) => {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "reportImages",
  });
  bucket
    .openDownloadStream(new mongoose.Types.ObjectId(req.params.id))
    .pipe(res);
});

export default reportRouter;
