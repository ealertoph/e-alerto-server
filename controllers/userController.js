import userModel from "../models/userModel.js";
import ActivityLog from "../models/activityLogsModel.js";
import Counter from "../models/idNumberModel.js";
import multer from "multer";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import { Readable } from "stream";
import { io, userSocketMap } from "../server.js"; // Import the map
import notificationModel from "../models/notificationModel.js";

// GET CURRENT USER
export const getUserData = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await userModel.findById(userId).lean();
    if (!user) return res.json({ success: false, message: "User not found" });

    res.json({
      success: true,
      userData: {
        _id: user._id,
        employeeNumber: user.employeeNumber,
        district: user.district,
        surname: user.surname,
        firstName: user.firstName,
        middleName: user.middleName,
        suffix: user.suffix,
        position: user.position,
        email: user.email,
        phone: user.phone,
        status: user.status, // ✅ included
        isAccountVerified: user.isAccountVerified,
        // expose these so front-end knows which file to fetch
        profilePic: user.profilePic,
        originalFileName: user.originalFileName,
      },
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

// LIST ALL USERS
export const listAllUsers = async (req, res) => {
  try {
    // pull ?archived=true|false (defaults to false)
    const showArchived = req.query.archived === "true";
    const users = await userModel
      .find(
        { archive: showArchived }, // ← dynamic filter
        "employeeNumber district surname firstName middleName suffix position email phone status"
      )
      .lean();

    const mapped = users.map((u) => ({
      id: u._id,
      employeeNumber: u.employeeNumber,
      district: u.district,
      surname: u.surname,
      firstName: u.firstName,
      middleName: u.middleName,
      suffix: u.suffix,
      position: u.position,
      email: u.email,
      phone: u.phone,
      status: u.status,
      fullName: `${u.firstName} ${u.middleName ? u.middleName + " " : ""}${
        u.surname
      }${u.suffix ? " " + u.suffix : ""}`,
    }));

    res.json({ success: true, users: mapped, count: mapped.length });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

// GET ONE USER
export const getOneUser = async (req, res) => {
  const { id } = req.params;
  try {
    const u = await userModel
      .findById(
        id,
        "employeeNumber district surname firstName middleName suffix position email phone status"
      )
      .lean();
    if (!u) return res.json({ success: false, message: "User not found" });

    res.json({
      success: true,
      user: {
        id: u._id,
        employeeNumber: u.employeeNumber,
        district: u.district,
        surname: u.surname,
        firstName: u.firstName,
        middleName: u.middleName,
        suffix: u.suffix,
        position: u.position,
        email: u.email,
        phone: u.phone,
        status: u.status, // ✅ included
      },
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

// CREATE NEW USER
export const createUser = async (req, res) => {
  try {
    const {
      district,
      surname,
      firstName,
      middleName,
      suffix,
      position,
      email,
      phone,
      userId: actorId, // the admin performing the action
    } = req.body;

    // 1. Generate employeeNumber
    const now = new Date();
    const YY = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const key = `emp-${YY}-${MM}`;
    const counter = await Counter.findByIdAndUpdate(
      key,
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const seqNo = String(counter.seq).padStart(5, "0");
    const employeeNumber = `QCDE-${YY}-${MM}-${seqNo}`;
    const password = "qcd3!23";

    // 2. Save new user
    const u = new userModel({
      employeeNumber,
      district,
      surname,
      firstName,
      middleName,
      suffix,
      position,
      email,
      phone,
      password,
      status: "Active",
    });
    await u.save();

    // 3. Generate logNumber for activity log
    const logKey = `log-${YY}-${MM}`;
    const logCounter = await Counter.findByIdAndUpdate(
      logKey,
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const logSeq = String(logCounter.seq).padStart(5, "0");
    const logNumber = `Log${YY}-${MM}-${logSeq}`;

    // 4. Log activity
    const actor = await userModel.findById(actorId).lean();
    const actorName = actor ? `${actor.firstName} ${actor.surname}` : "Unknown";

    await ActivityLog.create({
      logNumber,
      employeeId: actorId,
      employeeNumber: actor?.employeeNumber || "Unknown",
      employeeName: actorName,
      entityType: "Employee",
      entityId: u._id,
      displayId: employeeNumber,
      action: "Created new employee",
      oldValue: null,
      newValue: {
        employeeNumber,
        district,
        surname,
        firstName,
        middleName,
        suffix,
        position,
        email,
        phone,
        status: "Active",
      },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });

    // --------------------------
    // 🔔 Notifications
    // --------------------------
    const admins = await userModel
      .find({ position: /admin/i }) // matches Admin + Super Admin
      .select("_id")
      .lean();

    // Exclude the actor (no self-notify)
    let uniqueRecipientIds = admins
      .map((a) => a._id.toString())
      .filter((id) => id !== actorId.toString());

    uniqueRecipientIds = [...new Set(uniqueRecipientIds)].map(
      (s) => new mongoose.Types.ObjectId(s)
    );

    if (uniqueRecipientIds.length > 0) {
      const notifDoc = await notificationModel.create({
        sender: actorId,
        recipients: uniqueRecipientIds,
        entityType: "Employee",
        entityId: u._id,
        displayId: employeeNumber,
        action: "create",
        message: `${actorName} created a new employee ${employeeNumber}.`,
      });

      // Push realtime if online
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

    res.json({ success: true, user: { id: u._id, employeeNumber } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const updateUser = async (req, res) => {
  const { id } = req.params;
  const {
    district,
    surname,
    firstName,
    middleName,
    suffix,
    position,
    email,
    phone,
    status,
    userId, // actor
  } = req.body;

  try {
    const prev = await userModel.findById(id).lean();
    if (!prev) return res.json({ success: false, message: "User not found" });

    // Build update payload
    const updates = {
      district,
      surname,
      firstName,
      middleName,
      suffix,
      position,
      email,
      phone,
    };
    if (status !== undefined) updates.status = status;

    // REMOVE undefined values
    Object.keys(updates).forEach((k) => {
      if (updates[k] === undefined) delete updates[k];
    });

    const updated = await userModel
      .findByIdAndUpdate(id, updates, { new: true })
      .lean();
    if (!updated) {
      return res.json({
        success: false,
        message: "User not found after update",
      });
    }

    // Determine changes
    const changedOld = {};
    const changedNew = {};
    for (const key in updates) {
      if (updates[key] !== prev[key]) {
        changedOld[key] = prev[key] ?? null;
        changedNew[key] = updates[key];
      }
    }

    // Generate logNumber
    const now = new Date();
    const YY = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const logKey = `log-${YY}-${MM}`;
    const logCounter = await Counter.findByIdAndUpdate(
      logKey,
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const logSeq = String(logCounter.seq).padStart(5, "0");
    const logNumber = `Log${YY}-${MM}-${logSeq}`;

    // Get actor details
    const actor = await userModel.findById(userId).lean();
    const actorName = actor
      ? `${actor.firstName} ${actor.middleName ? actor.middleName + " " : ""}${
          actor.surname
        }${actor.suffix ? ", " + actor.suffix : ""}`
      : "Unknown";

    // Create activity log
    await ActivityLog.create({
      logNumber,
      employeeId: userId,
      employeeNumber: actor?.employeeNumber || "Unknown",
      employeeName: actorName,
      entityType: "Employee",
      entityId: updated._id,
      displayId: updated.employeeNumber,
      action: "Updated employee",
      oldValue: Object.keys(changedOld).length ? changedOld : null,
      newValue: Object.keys(changedNew).length ? changedNew : null,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });

    // --------------------------
    // 🔔 Notifications
    // --------------------------
    let recipients = [];

    // If actor is admin → notify the updated user + other admins
    if (/admin/i.test(actor?.position)) {
      recipients.push({ _id: updated._id }); // notify the updated employee
      const admins = await userModel
        .find({ position: /admin/i })
        .select("_id")
        .lean();
      recipients.push(...admins);
    }
    // If actor is not admin → notify admins for transparency
    else {
      const admins = await userModel
        .find({ position: /admin/i })
        .select("_id")
        .lean();
      recipients.push(...admins);
    }

    // Deduplicate + exclude self
    let uniqueRecipientIds = [
      ...new Set(recipients.map((r) => r._id.toString())),
    ].filter((id) => id !== userId.toString());

    // Convert back to ObjectId
    uniqueRecipientIds = uniqueRecipientIds.map(
      (s) => new mongoose.Types.ObjectId(s)
    );

    if (uniqueRecipientIds.length > 0) {
      const notifDoc = await notificationModel.create({
        sender: userId,
        recipients: uniqueRecipientIds,
        entityType: "Employee",
        entityId: updated._id,
        displayId: updated.employeeNumber,
        action: "update",
        message: `${actorName} updated employee ${updated.employeeNumber}.`,
      });

      // Push realtime if online
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

    res.json({ success: true, message: "User updated" });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const prev = await userModel.findById(id).lean();
    if (!prev) {
      return res.json({ success: false, message: "User not found" });
    }

    // Delete user from database
    await userModel.findByIdAndDelete(id);

    // Get actor info
    const actor = await userModel.findById(req.body.userId).lean();
    const actorName = actor
      ? `${actor.firstName} ${actor.middleName ? actor.middleName + " " : ""}${
          actor.surname
        }${actor.suffix ? ", " + actor.suffix : ""}`
      : "Unknown";

    // Generate logNumber
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

    // Create activity log
    await ActivityLog.create({
      logNumber,
      employeeId: req.body.userId,
      employeeNumber: actor?.employeeNumber || "Unknown",
      employeeName: actorName,
      entityType: "Employee",
      entityId: id,
      displayId: prev.employeeNumber,
      action: "Deleted employee",
      oldValue: {
        district: prev.district,
        surname: prev.surname,
        firstName: prev.firstName,
        middleName: prev.middleName,
        suffix: prev.suffix,
        position: prev.position,
        email: prev.email,
        phone: prev.phone,
        status: prev.status,
      },
      newValue: null,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });

    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

// ARCHIVE USER
export const archiveUser = async (req, res) => {
  const { id } = req.params;

  try {
    const prev = await userModel.findById(id).lean();
    if (!prev) return res.json({ success: false, message: "User not found" });

    await userModel.findByIdAndUpdate(id, { archive: true });

    const actor = await userModel.findById(req.body.userId).lean();
    const actorName = actor
      ? `${actor.firstName} ${actor.middleName ? actor.middleName + " " : ""}${
          actor.surname
        }${actor.suffix ? ", " + actor.suffix : ""}`
      : "Unknown";

    // Generate logNumber
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
      employeeNumber: actor?.employeeNumber || "Unknown",
      employeeName: actorName,
      entityType: "Employee",
      entityId: id,
      displayId: prev.employeeNumber,
      action: "Archived employee",
      oldValue: { archive: prev.archive },
      newValue: { archive: true },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });

    // --------------------------
    // 🔔 Notifications
    // --------------------------
    const admins = await userModel
      .find({ position: /admin/i })
      .select("_id")
      .lean();

    let uniqueRecipientIds = admins
      .map((a) => a._id.toString())
      .filter((id) => id !== req.body.userId.toString());

    uniqueRecipientIds = [...new Set(uniqueRecipientIds)].map(
      (s) => new mongoose.Types.ObjectId(s)
    );

    if (uniqueRecipientIds.length > 0) {
      const notifDoc = await notificationModel.create({
        sender: req.body.userId,
        recipients: uniqueRecipientIds,
        entityType: "Employee",
        entityId: id,
        displayId: prev.employeeNumber,
        action: "archive",
        message: `${actorName} archived employee ${prev.employeeNumber}.`,
      });

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

    return res.json({ success: true, message: "User archived" });
  } catch (err) {
    return res.json({ success: false, message: err.message });
  }
};

// UNARCHIVE USER
export const unarchiveUser = async (req, res) => {
  const { id } = req.params;

  try {
    const prev = await userModel.findById(id).lean();
    if (!prev) return res.json({ success: false, message: "User not found" });

    await userModel.findByIdAndUpdate(id, { archive: false });

    const actor = await userModel.findById(req.body.userId).lean();
    const actorName = actor
      ? `${actor.firstName} ${actor.middleName ? actor.middleName + " " : ""}${
          actor.surname
        }${actor.suffix ? ", " + actor.suffix : ""}`
      : "Unknown";

    // Generate logNumber
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
      employeeNumber: actor?.employeeNumber || "Unknown",
      employeeName: actorName,
      entityType: "Employee",
      entityId: id,
      displayId: prev.employeeNumber,
      action: "Unarchived employee",
      oldValue: { archive: prev.archive },
      newValue: { archive: false },
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });

    // --------------------------
    // 🔔 Notifications
    // --------------------------
    const admins = await userModel
      .find({ position: /admin/i })
      .select("_id")
      .lean();

    let uniqueRecipientIds = admins
      .map((a) => a._id.toString())
      .filter((id) => id !== req.body.userId.toString());

    uniqueRecipientIds = [...new Set(uniqueRecipientIds)].map(
      (s) => new mongoose.Types.ObjectId(s)
    );

    if (uniqueRecipientIds.length > 0) {
      const notifDoc = await notificationModel.create({
        sender: req.body.userId,
        recipients: uniqueRecipientIds,
        entityType: "Employee",
        entityId: id,
        displayId: prev.employeeNumber,
        action: "unarchive",
        message: `${actorName} restored employee ${prev.employeeNumber}.`,
      });

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

    return res.json({ success: true, message: "User restored" });
  } catch (err) {
    return res.json({ success: false, message: err.message });
  }
};

// Profile Picture
// Replace with GridFSBucket + memory upload like assignmentController
const upload = multer({ storage: multer.memoryStorage() });

export const uploadEmployeeProfilePic = [
  upload.single("profile"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.body.userId;

      const file = req.file;
      if (!file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      }

      const user = await userModel.findById(id).lean();
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const bucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: "profile",
      });

      const readable = Readable.from(file.buffer);
      const uploadStream = bucket.openUploadStream(file.originalname, {
        contentType: file.mimetype,
      });

      readable.pipe(uploadStream);

      uploadStream.on("finish", async () => {
        const fileId = uploadStream.id;

        await userModel.findByIdAndUpdate(id, {
          profilePic: fileId,
        });

        // Optional log can be inserted here if needed

        return res.json({
          success: true,
          message: "Profile picture uploaded",
          fileId,
        });
      });

      uploadStream.on("error", (err) => {
        console.error("GridFS upload error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Upload failed" });
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },
];

// ─── GET PROFILE PICTURE ─────────────────────────────────────────────────────────
export const getProfilePic = async (req, res) => {
  try {
    const { id } = req.params;
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "profile",
    });
    const _id = new mongoose.Types.ObjectId(id);

    // ✅ Add headers to allow cross-origin image usage
    res.setHeader(
      "Access-Control-Allow-Origin",
      "https://www.ealerto-qcde.com"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const downloadStream = bucket.openDownloadStream(_id);

    downloadStream.on("error", () => {
      return res
        .status(404)
        .json({ success: false, message: "Profile picture not found" });
    });

    downloadStream.pipe(res);
  } catch (err) {
    console.error("Profile image error:", err);
    res.status(400).json({ success: false, message: "Invalid file id" });
  }
};
