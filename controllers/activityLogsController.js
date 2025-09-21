import ActivityLog from "../models/activityLogsModel.js";
import userModel from "../models/userModel.js";
import Assignment from "../models/assignmentModel.js";
import Report from "../models/reportModel.js";
import Counter from "../models/idNumberModel.js";

// GET /api/activitylogs/list-all
export const listAllLogs = async (req, res) => {
  try {
    const logs = await ActivityLog.find().sort({ createdAt: -1 }).lean();

    const mapped = logs.map((log) => ({
      id: log._id,
      logNumber: log.logNumber,
      timestamp: log.createdAt,
      employeeId: log.employeeId,
      employeeNumber: log.employeeNumber, // ✅ added
      employeeName: log.employeeName,
      entityType: log.entityType,
      displayId: log.displayId,
      action: log.action,
      oldValue: log.oldValue,
      newValue: log.newValue,
      ipAddress: log.ipAddress,
    }));

    res.json({ success: true, logs: mapped });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

// POST /api/activitylogs/create
export const createLog = async (req, res) => {
  try {
    const {
      entityType,
      entityId,
      action,
      oldValue = null,
      newValue = null,
    } = req.body;

    const employeeId = req.body.userId;

    // Step 1: Generate logNumber
    const now = new Date();
    const YY = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const key = `log-${YY}-${MM}`;

    const counter = await Counter.findByIdAndUpdate(
      key,
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );

    const seqNo = String(counter.seq).padStart(5, "0");
    const logNumber = `Log${YY}-${MM}-${seqNo}`;

    // Step 2: Determine displayId
    let displayId = null;

    if (entityType === "Employee") {
      const emp = await userModel.findById(entityId).lean();
      displayId = emp?.employeeNumber || null;
    } else if (entityType === "Report") {
      const rep = await Report.findById(entityId).lean();
      displayId = rep?.reportNumber || null;
    } else if (entityType === "Assignment") {
      const assn = await Assignment.findById(entityId).lean();
      displayId = assn?.assignmentNumber || null;
    }

    // Step 3: Fetch actor info
    const user = await userModel.findById(employeeId).lean();
    const employeeName = user
      ? `${user.firstName} ${user.middleName ? user.middleName + " " : ""}${
          user.surname
        }${user.suffix ? ", " + user.suffix : ""}`
      : "Unknown";
    const employeeNumber = user?.employeeNumber || "Unknown";

    // Step 4: Create log entry
    const log = await ActivityLog.create({
      logNumber,
      employeeId,
      employeeNumber,
      employeeName,
      entityType,
      entityId,
      displayId,
      action,
      oldValue,
      newValue,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });

    return res.json({ success: true, log });
  } catch (err) {
    return res.json({ success: false, message: err.message });
  }
};

// DELETE /api/activitylogs/purge
export const purgeLogs = async (req, res) => {
  try {
    // Fetch the actor performing the purge
    const user = await userModel.findById(req.body.userId).lean();

    // Only Super Admins may purge activity logs
    if (user.position !== "Super Admin") {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // Parse and validate the cutoff date
    const { beforeDate } = req.body;
    const cutoff = new Date(beforeDate);
    if (isNaN(cutoff)) {
      return res.status(400).json({ success: false, message: "Invalid date" });
    }

    // Perform the purge
    const { deletedCount } = await ActivityLog.deleteMany({
      createdAt: { $lt: cutoff },
    });

    // --- Record the purge action itself as an audit log ---
    // Generate a new logNumber using the same counter approach
    const now = new Date();
    const YY = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const key = `log-${YY}-${MM}`;
    const counter = await Counter.findByIdAndUpdate(
      key,
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const seqNo = String(counter.seq).padStart(5, "0");
    const logNumber = `Log${YY}-${MM}-${seqNo}`;

    await ActivityLog.create({
      logNumber,
      employeeId: user._id,
      employeeNumber: user.employeeNumber,
      employeeName: [
        user.firstName,
        user.middleName,
        user.surname,
        user.suffix ? `, ${user.suffix}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      entityType: "ActivityLog",
      entityId: null,
      displayId: null,
      action: "Purge Logs",
      oldValue: JSON.stringify({ beforeDate: cutoff.toISOString() }),
      newValue: JSON.stringify({ deletedCount }),
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });

    // Return the purge response
    return res.json({
      success: true,
      message: `Purged ${deletedCount} logs before ${cutoff.toISOString()}`,
      deletedCount,
    });
  } catch (err) {
    return res.json({ success: false, message: err.message });
  }
};
