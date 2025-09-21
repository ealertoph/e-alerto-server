// controllers/assignmentController.js
import { GridFSBucket } from "mongodb";
import mongoose from "mongoose";
import { Readable } from "stream";
import multer from "multer";
import Assignment from "../models/assignmentModel.js";
import Report from "../models/reportModel.js";
import ActivityLog from "../models/activityLogsModel.js";
import userModel from "../models/userModel.js"; // ← for employeeName
import Counter from "../models/idNumberModel.js"; // for Assignment ID
import regUserModel from "../models/regUserModel.js"; // to look up oneSignalId
import axios from "axios";
import { io, userSocketMap } from "../server.js"; // Import the map
import notificationModel from "../models/notificationModel.js";

export const listAllAssignments = async (req, res) => {
  try {
    const user = await userModel.findById(req.body.userId).lean();
    const isEngineer = user.position
      .toLowerCase()
      .includes("district engineer");

    const assignments = isEngineer
      ? await Assignment.find({ assignedTo: req.body.userId }).lean()
      : await Assignment.find().lean();

    return res.json({ success: true, assignments });
  } catch (err) {
    console.error("Error fetching assignments:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const createAssignment = async (req, res) => {
  try {
    const { reportNumber, status, assignedTo = null } = req.body;

    // 0) year+month key
    const now = new Date();
    const YY = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const key = `${YY}-${MM}`;

    // 1) assignment number
    const counter = await Counter.findByIdAndUpdate(
      key,
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const seqNo = String(counter.seq).padStart(5, "0");
    const assignmentNumber = `PA${key}-${seqNo}`;

    // 2) create assignment
    const a = await Assignment.create({
      reportNumber,
      status,
      assignedTo: assignedTo || null,
      assignmentNumber,
    });

    // 3) update report status
    await Report.findOneAndUpdate({ reportNumber: a.reportNumber }, { status });

    // 4) activity log
    const logKey = `log-${YY}-${MM}`;
    const logCounter = await Counter.findByIdAndUpdate(
      logKey,
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const logSeq = String(logCounter.seq).padStart(5, "0");
    const logNumber = `Log${YY}-${MM}-${logSeq}`;

    const user = await userModel.findById(req.body.userId).lean();
    const userName = user
      ? `${user.firstName} ${user.middleName || ""} ${user.surname}`.trim()
      : "Unknown";

    const createdLog = await ActivityLog.create({
      logNumber,
      employeeId: req.body.userId,
      employeeNumber: user?.employeeNumber || "Unknown",
      employeeName: userName,
      entityType: "Assignment",
      entityId: a._id,
      displayId: assignmentNumber,
      action: "Created assignment",
      oldValue: null,
      newValue: status,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });

    io.emit("newActivityLog", createdLog);

    // 5) notifications (same style as updateAssignment)
    let recipients = [];

    if (a.assignedTo) {
      // Notify the assigned engineer
      recipients.push({ _id: a.assignedTo });
    }

    // Also notify admins (for transparency)
    const admins = await userModel
      .find({ position: /admin/i })
      .select("_id")
      .lean();
    recipients.push(...admins);

    // Deduplicate + remove self
    let uniqueRecipientIds = [
      ...new Set(recipients.map((r) => r._id.toString())),
    ].filter((id) => id !== req.body.userId.toString());

    uniqueRecipientIds = uniqueRecipientIds.map(
      (s) => new mongoose.Types.ObjectId(s)
    );

    if (uniqueRecipientIds.length > 0) {
      const notifDoc = await notificationModel.create({
        sender: req.body.userId,
        recipients: uniqueRecipientIds,
        entityType: "Assignment",
        entityId: a._id,
        displayId: assignmentNumber,
        action: "create",
        message: `${userName} created a new assignment ${assignmentNumber}.`,
      });

      // Real-time emit
      for (const rId of uniqueRecipientIds) {
        const sid = userSocketMap[rId.toString()];
        if (sid) {
          io.to(sid).emit("newNotification", {
            ...notifDoc.toObject(),
            date: notifDoc.createdAt,
          });
        }
      }
    }

    return res.json({ success: true, assignment: a });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignedTo = null } = req.body;

    // 1) fetch previous state
    const prev = await Assignment.findById(id).lean();
    if (!prev) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    // 2) build the `update` and `logs`
    const update = {};
    const logs = [];

    if (status !== undefined && status !== prev.status) {
      update.status = status;
      logs.push({ type: "status", oldVal: prev.status, newVal: status });
    }

    if (
      "assignedTo" in req.body &&
      String(assignedTo) !== String(prev.assignedTo)
    ) {
      update.assignedTo = assignedTo || null;
      logs.push({
        type: "assignee",
        oldVal: prev.assignedTo,
        newVal: assignedTo,
      });
    }

    // If no changes were made, return early
    if (Object.keys(update).length === 0) {
      return res.json({
        success: true,
        assignment: prev,
        message: "No changes made.",
      });
    }

    // 3) apply update to the assignment
    const a = await Assignment.findByIdAndUpdate(id, update, { new: true });
    if (!a) {
      return res
        .status(404)
        .json({ success: false, message: "Not found after update" });
    }

    // 4) mirror status on the Report and notify the mobile user
    if (update.status) {
      const report = await Report.findOneAndUpdate(
        { reportNumber: a.reportNumber },
        { status: update.status },
        { new: true, lean: true }
      );

      if (report?.userId) {
        const submitter = await regUserModel.findById(report.userId).lean();
        const playerId = submitter?.oneSignalPlayerId;
        if (playerId) {
          await axios.post(
            "https://onesignal.com/api/v1/notifications",
            {
              app_id: process.env.ONESIGNAL_APP_ID,
              include_player_ids: [playerId],
              headings: { en: "Report Status Updated" },
              contents: {
                en: `Your report (${report._id}) is now ${update.status}.`,
              },
              data: { reportNumber: report._id, newStatus: update.status },
            },
            {
              headers: {
                Authorization: `Basic ${process.env.ONE_SIGNAL_REST_API_KEY}`,
                "Content-Type": "application/json",
              },
            }
          );
        }
      }
    }

    // 5) record activity logs
    const user = await userModel.findById(req.body.userId).lean();
    const userName = user
      ? `${user.firstName} ${user.middleName || ""} ${user.surname}`.trim()
      : "Unknown";

    const now = new Date();
    const YY = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const logKey = `log-${YY}-${MM}`;

    for (let lg of logs) {
      const counter = await Counter.findByIdAndUpdate(
        logKey,
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      const logSeq = String(counter.seq).padStart(5, "0");
      const logNumber = `Log${YY}-${MM}-${logSeq}`;

      const createdLog = await ActivityLog.create({
        logNumber,
        employeeId: req.body.userId,
        employeeNumber: user?.employeeNumber || "Unknown",
        employeeName: userName,
        entityType: "Assignment",
        entityId: a._id,
        displayId: a.assignmentNumber,
        action:
          lg.type === "status"
            ? "Changed assignment status"
            : "Changed assignment assignee",
        oldValue: lg.oldVal,
        newValue: lg.newVal,
        ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
      });

      io.emit("newActivityLog", createdLog);
    }

    // 6) notifications (NOW PERSISTENT AND REAL-TIME, EXCLUDING SELF)
    let recipients = [];

    if (logs.length > 0) {
      if (user.position?.toLowerCase().includes("engineer")) {
        // Engineer updated → notify admins
        recipients = await userModel
          .find({ position: /admin/i })
          .select("_id")
          .lean();
      } else if (/admin/i.test(user.position)) {
        // Admin updated → notify assigned engineer + other admins
        if (a.assignedTo) {
          recipients.push({ _id: a.assignedTo });
        }
        const admins = await userModel
          .find({ position: /admin/i })
          .select("_id")
          .lean();
        recipients.push(...admins);
      }

      // Deduplicate and convert to ObjectIds
      let uniqueRecipientIds = [
        ...new Set(recipients.map((r) => r._id.toString())),
      ];

      // 🚫 Remove self (the actor)
      uniqueRecipientIds = uniqueRecipientIds.filter(
        (id) => id !== req.body.userId.toString()
      );

      // Convert back to ObjectId type
      uniqueRecipientIds = uniqueRecipientIds.map(
        (s) => new mongoose.Types.ObjectId(s)
      );

      if (uniqueRecipientIds.length > 0) {
        // Step A: Always store the notification in the DB first (Persistence)
        const notifDoc = await notificationModel.create({
          sender: req.body.userId,
          recipients: uniqueRecipientIds,
          entityType: "Assignment",
          entityId: a._id,
          displayId: a.assignmentNumber,
          action: logs.map((lg) => lg.type).join(","),
          message: `${userName} updated assignment ${a.assignmentNumber}.`,
        });

        // Step B: If recipients are online, push via Socket.IO (Real-time)
        for (const rId of uniqueRecipientIds) {
          const sid = userSocketMap[rId.toString()];
          if (sid) {
            io.to(sid).emit("newNotification", {
              ...notifDoc.toObject(),
              date: notifDoc.createdAt,
            });
          }
        }
      }
    }

    // 7) auto-archive if completed or rejected
    if (["Completed", "Rejected"].includes(a.status)) {
      await Assignment.findByIdAndUpdate(id, { archive: true });
    }

    return res.json({ success: true, assignment: a });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Fetch & delete the assignment
    const a = await Assignment.findByIdAndDelete(id);
    if (!a) return res.json({ success: false, message: "Not found" });

    // 2) Update the corresponding report's status
    await Report.findOneAndUpdate(
      { reportNumber: a.reportNumber },
      { status: "Submitted" }
    );

    // 3) Get user info for logging
    const user = await userModel.findById(req.body.userId).lean();
    const userName = user
      ? `${user.firstName} ${user.middleName ? user.middleName + " " : ""}${
          user.surname
        }${user.suffix ? ", " + user.suffix : ""}`
      : "Unknown";

    // 4) Generate logNumber
    const now = new Date();
    const YY = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const logKey = `log-${YY}-${MM}`;

    const counter = await Counter.findByIdAndUpdate(
      logKey,
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const logSeq = String(counter.seq).padStart(5, "0");
    const logNumber = `Log${YY}-${MM}-${logSeq}`;

    // 5) Record log
    await ActivityLog.create({
      logNumber,
      employeeId: req.body.userId,
      employeeNumber: user?.employeeNumber || "Unknown",
      employeeName: userName,
      entityType: "Assignment",
      entityId: a._id,
      displayId: a.assignmentNumber,
      action: "Deleted assignment",
      oldValue: a.status,
      newValue: null,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });

    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, message: err.message });
  }
};

// configure multer to store uploads in ./uploads
export const upload = multer({ storage: multer.memoryStorage() });

export const uploadSiteReport = [
  upload.single("report"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const status = req.body.status || "Completed";
      const userId = req.body.userId;
      const remarks = req.body.remarks || "";

      // 1) fetch previous assignment
      const prev = await Assignment.findById(id).lean();
      if (!prev) {
        return res.status(404).json({ success: false, message: "Not found" });
      }

      // 2) ensure file present
      const file = req.file;
      if (!file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      }

      // 3) stream into GridFS
      const bucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: "uploads",
      });
      const readable = Readable.from(file.buffer);
      const uploadStream = bucket.openUploadStream(file.originalname, {
        contentType: file.mimetype,
      });

      readable.pipe(uploadStream);

      // 4) when done, update Assignment & Report, log activity
      uploadStream.on("finish", async () => {
        const fileId = uploadStream.id;

        const assignment = await Assignment.findByIdAndUpdate(
          id,
          {
            status,
            siteInspectionReport: fileId,
            originalFileName: file.originalname,
            accomplishmentDate: new Date(),
            remarks,
          },
          { new: true }
        );

        await Report.findOneAndUpdate(
          { reportNumber: assignment.reportNumber },
          { status }
        );

        const user = await userModel.findById(userId).lean();
        const userName = user
          ? `${user.firstName} ${user.middleName || ""} ${user.surname}`.trim()
          : "Unknown";

        // Build log number
        const now = new Date();
        const YY = String(now.getFullYear()).slice(-2);
        const MM = String(now.getMonth() + 1).padStart(2, "0");
        const logKey = `log-${YY}-${MM}`;

        const counter = await Counter.findByIdAndUpdate(
          logKey,
          { $inc: { seq: 1 } },
          { upsert: true, new: true }
        );
        const logSeq = String(counter.seq).padStart(5, "0");
        const logNumber = `Log${YY}-${MM}-${logSeq}`;

        // Log upload
        await ActivityLog.create({
          logNumber,
          employeeId: userId,
          employeeNumber: user?.employeeNumber || "Unknown",
          employeeName: userName,
          entityType: "Assignment",
          entityId: assignment._id,
          displayId: assignment.assignmentNumber,
          action: `Uploaded site report "${file.originalname}"`,
          oldValue: prev.status,
          newValue: status,
          ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
        });

        if (["Completed", "Rejected"].includes(status)) {
          await Assignment.findByIdAndUpdate(id, { archive: true });
        }

        return res.json({ success: true, assignment });
      });

      uploadStream.on("error", (err) => {
        console.error("GridFS upload error:", err);
        return res
          .status(500)
          .json({ success: false, message: "File upload failed" });
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },
];

export const archiveAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    const prev = await Assignment.findById(id).lean();
    if (!prev)
      return res.json({ success: false, message: "Assignment not found" });

    const updated = await Assignment.findByIdAndUpdate(
      id,
      { archive: true },
      { new: true }
    );

    const user = await userModel.findById(req.body.userId).lean();
    const userName = user
      ? `${user.firstName} ${user.middleName || ""} ${user.surname}`.trim()
      : "Unknown";

    const now = new Date();
    const YY = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const logKey = `log-${YY}-${MM}`;
    const counter = await Counter.findByIdAndUpdate(
      logKey,
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const logNumber = `Log${YY}-${MM}-${String(counter.seq).padStart(5, "0")}`;

    await ActivityLog.create({
      logNumber,
      employeeId: req.body.userId,
      employeeNumber: user?.employeeNumber || "Unknown",
      employeeName: userName,
      entityType: "Assignment",
      entityId: updated._id,
      displayId: updated.assignmentNumber,
      action: "Archived assignment",
      oldValue: { archive: prev.archive },
      newValue: { archive: true },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });

    res.json({ success: true, assignment: updated });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const unarchiveAssignment = async (req, res) => {
  const { id } = req.params;

  try {
    // 1) grab existing assignment
    const prev = await Assignment.findById(id).lean();
    if (!prev) {
      return res.json({ success: false, message: "Assignment not found" });
    }

    // 2) unarchive it
    const updated = await Assignment.findByIdAndUpdate(
      id,
      { archive: false },
      { new: true }
    );

    // 3) fetch the actor, including employeeNumber
    const actor = await userModel
      .findById(
        req.body.userId,
        "firstName middleName surname suffix employeeNumber"
      )
      .lean();

    const userName = actor
      ? [
          actor.firstName,
          actor.middleName,
          actor.surname + (actor.suffix ? `, ${actor.suffix}` : ""),
        ]
          .filter(Boolean)
          .join(" ")
      : "Unknown";

    // 4) build logNumber
    const now = new Date();
    const YY = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const logKey = `log-${YY}-${MM}`;
    const counter = await Counter.findByIdAndUpdate(
      logKey,
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const logNumber = `Log${YY}-${MM}-${String(counter.seq).padStart(5, "0")}`;

    // 5) record the unarchive in ActivityLog
    await ActivityLog.create({
      logNumber,
      employeeId: req.body.userId,
      employeeNumber: actor?.employeeNumber || "Unknown",
      employeeName: userName,
      entityType: "Assignment",
      entityId: updated._id,
      displayId: updated.assignmentNumber,
      action: "Unarchived assignment",
      oldValue: { archive: prev.archive },
      newValue: { archive: false },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });

    return res.json({ success: true, message: "Assignment unarchived" });
  } catch (err) {
    return res.json({ success: false, message: err.message });
  }
};
