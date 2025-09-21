// routes/assignmentRoutes.js
import express from "express";
import { GridFSBucket } from "mongodb";
import mongoose from "mongoose";
import {
  listAllAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  uploadSiteReport,
  archiveAssignment,
  unarchiveAssignment,
} from "../controllers/assignmentController.js";
import userAuth from "../middleware/userAuth.js";

const assignmentRouter = express.Router();

// List all assignments (role-based)
assignmentRouter.get("/list-all", userAuth, listAllAssignments);

// Create a new assignment
assignmentRouter.post("/create", userAuth, createAssignment);

// Update assignment status or assignee
assignmentRouter.put("/update/:id", userAuth, updateAssignment);

// Delete an assignment (reverts report status)
assignmentRouter.delete("/delete/:id", userAuth, deleteAssignment);

// Upload site inspection report (streams into GridFS)
assignmentRouter.post("/upload-report/:id", userAuth, uploadSiteReport);

// Download site inspection report by GridFS ObjectId
assignmentRouter.get("/download-report/:id", userAuth, async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    const fileDoc = await mongoose.connection.db
      .collection("uploads.files")
      .findOne({ _id: fileId });
    if (!fileDoc) {
      return res
        .status(404)
        .json({ success: false, message: "File not found" });
    }

    res
      .set("Content-Type", fileDoc.contentType || "application/pdf")
      .set("Content-Disposition", `attachment; filename="${fileDoc.filename}"`);

    bucket.openDownloadStream(fileId).pipe(res);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

assignmentRouter.put("/archive/:id", userAuth, archiveAssignment);
assignmentRouter.put("/unarchive/:id", userAuth, unarchiveAssignment);

export default assignmentRouter;
