import reportModel from "../models/reportModel.js";
import Assignment from "../models/assignmentModel.js";
import userModel from "../models/userModel.js"; // ← add this
import ActivityLog from "../models/activityLogsModel.js";
import Counter from "../models/idNumberModel.js";
import notificationModel from "../models/notificationModel.js";
import { io, userSocketMap } from "../server.js";
import mongoose from "mongoose"; // ✨ Add this line

// GET all reports
export const listAllReports = async (req, res) => {
  try {
    const user = await userModel.findById(req.body.userId).lean();
    const isEngineer = user.position
      .toLowerCase()
      .includes("district engineer");

    let reportFilter = {};
    if (isEngineer) {
      // Find all reportIds assigned to this user
      const assigns = await Assignment.find({ assignedTo: req.body.userId })
        .select("reportNumber")
        .lean();
      const ids = assigns.map((a) => a.reportNumber);
      reportFilter.reportNumber = { $in: ids }; // Use reportNumber for filtering
    }

    const reports = await reportModel
      .find(reportFilter)
      .sort({ duplicateCounter: -1 }); // Sorting by duplicateCounter in descending order

    // Map reports and calculate days since the report was submitted
    const mapped = reports.map((r) => {
      const reportDate = new Date(r.timestamp); // Report timestamp
      const currentDate = new Date(); // Current date

      // Set both dates to midnight (ignoring hours, minutes, and seconds)
      reportDate.setHours(0, 0, 0, 0);
      currentDate.setHours(0, 0, 0, 0);

      const diffTime = currentDate - reportDate; // Difference in time
      const daysSinceReport = Math.floor(diffTime / (1000 * 60 * 60 * 24)); // Convert time to days

      return {
        reportNumber: r.reportNumber,
        classification: r.classification,
        measurement: r.measurement,
        location: r.location,
        district: r.district, // Ensure district is included
        status: r.status,
        description: r.description,
        timestamp: r.timestamp,
        image: r.image_file,
        duplicateCounter: r.duplicateCounter,
        daysSinceReport, // Add the daysSinceReport field to each report
      };
    });

    return res.json({ success: true, reports: mapped });
  } catch (err) {
    return res.json({ success: false, message: err.message });
  }
};

// GET single report
export const getOneReport = async (req, res) => {
  const { id } = req.params;
  try {
    const report = await reportModel.findById(id);
    if (!report) {
      return res.json({ success: false, message: "Report not found" });
    }

    const mapped = {
      reportNumber: report.reportNumber, // ✅ must be 'id'
      classification: report.classification,
      measurement: report.measurement,
      location: report.location,
      district: r.district, // Ensure district is included
      status: report.status,
      description: report.description,
      timestamp: report.timestamp,
      image: report.image_file, // ✅ must be 'image'
    };

    res.json({ success: true, report: mapped });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

// CREATE new report
export const createReport = async (req, res) => {
  try {
    const {
      reportNumber,
      classification,
      measurement,
      location,
      district,
      status,
      username,
      description,
      image_file,
    } = req.body;

    const newReport = new reportModel({
      reportNumber,
      classification,
      measurement,
      location,
      district,
      status,
      username,
      description,
      image_file,
    });

    await newReport.save();
    res.json({ success: true, message: "Report created" });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

// UPDATE report
export const updateReport = async (req, res) => {
  const { id } = req.params; // reportNumber, not MongoDB _id
  const { measurement, userId, ...otherFields } = req.body;

  try {
    // 1) fetch previous state
    const prev = await reportModel.findOne({ reportNumber: id }).lean();
    if (!prev) {
      return res.json({ success: false, message: "Report not found" });
    }

    // 2) apply update (including measurement if present)
    const updated = await reportModel
      .findOneAndUpdate(
        { reportNumber: id },
        {
          ...otherFields,
          ...(measurement !== undefined ? { measurement } : {}),
        },
        { new: true }
      )
      .lean();

    // 3) if measurement changed, record an activity log
    if (
      measurement !== undefined &&
      String(prev.measurement) !== String(measurement)
    ) {
      // fetch actor info
      const user = await userModel.findById(userId).lean();
      const employeeName = user
        ? `${user.firstName} ${user.middleName ? user.middleName + " " : ""}${
            user.surname
          }${user.suffix ? ", " + user.suffix : ""}`
        : "Unknown";

      // generate logNumber
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
        employeeId: userId,
        employeeNumber: user?.employeeNumber || null,
        employeeName,
        entityType: "Report",
        entityId: updated._id,
        displayId: updated.reportNumber,
        action: "Updated measurement",
        oldValue: prev.measurement,
        newValue: measurement,
        ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
      });

      // --------------------------
      // 🔔 Notifications
      // --------------------------
      let recipientIds = [];

      if (/district engineer/i.test(user?.position)) {
        // Case 1: DE updates → notify Admins + Super Admins
        const admins = await userModel
          .find({
            position: { $in: ["Admin", "Super Admin"] },
            status: "Active",
            archive: false,
          })
          .select("_id")
          .lean();

        recipientIds = admins.map((a) => a._id.toString());
      } else if (/admin/i.test(user?.position)) {
        // Case 2: Admin updates → notify assigned Engineer + other Admins/Super Admins
        // 🔔 Fetch the assigned engineer from the Assignment model
        const assignment = await Assignment.findOne({
          reportNumber: id,
        }).lean();
        const assignedEngineerId = assignment?.assignedTo;

        // Build the query to find all recipients
        const orQuery = [{ position: { $in: ["Admin", "Super Admin"] } }];
        if (assignedEngineerId) {
          orQuery.push({ _id: assignedEngineerId });
        }

        const recipients = await userModel
          .find({
            $or: orQuery,
            status: "Active",
            archive: false,
          })
          .select("_id")
          .lean();

        recipientIds = recipients.map((r) => r._id.toString());
      }

      // Exclude actor
      recipientIds = recipientIds.filter((id) => id !== userId.toString());
      // Deduplicate
      recipientIds = [...new Set(recipientIds)].map(
        (s) => new mongoose.Types.ObjectId(s)
      );

      if (recipientIds.length > 0) {
        const notifDoc = await notificationModel.create({
          sender: userId,
          recipients: recipientIds,
          entityType: "Report",
          entityId: updated._id,
          displayId: updated.reportNumber,
          action: "update-measurement",
          message: `${employeeName} updated measurement for Report ${updated.reportNumber}.`,
        });

        for (const rId of recipientIds) {
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

    return res.json({ success: true, message: "Report updated" });
  } catch (err) {
    return res.json({ success: false, message: err.message });
  }
};

// DELETE report
export const deleteReport = async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await reportModel.findByIdAndDelete(id);
    if (!deleted) {
      return res.json({ success: false, message: "Report not found" });
    }

    res.json({ success: true, message: "Report deleted" });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

// For Visualization
export const getReportAnalytics = async (req, res) => {
  const { start, end } = req.query;

  try {
    // 1) build an optional match stage
    const matchStage =
      start && end
        ? [
            {
              $match: {
                timestamp: {
                  $gte: new Date(start),
                  $lte: new Date(end),
                },
              },
            },
          ]
        : [];

    // 2) group by day and count
    const pipeline = [
      ...matchStage,
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
          },
          count: { $sum: 1 },
        },
      },
      // 3) sort by date ascending
      { $sort: { _id: 1 } },
      // 4) project into { label, count }
      {
        $project: {
          _id: 0,
          label: "$_id",
          count: 1,
        },
      },
    ];

    const result = await reportModel.aggregate(pipeline);
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("Error in getReportAnalytics:", err);
    return res.json({ success: false, message: err.message });
  }
};

export const getStatusAnalytics = async (req, res) => {
  const { start, end } = req.query;

  try {
    // If both start & end are given, filter by range
    const matchStage =
      start && end
        ? [
            {
              $match: {
                timestamp: { $gte: new Date(start), $lte: new Date(end) },
              },
            },
          ]
        : [];

    const pipeline = [
      // 1) optional date‐range filter
      ...matchStage,

      // 2) group by day + status
      {
        $group: {
          _id: {
            label: {
              $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
            },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },

      // 3) pivot statuses into an array of k/v
      {
        $group: {
          _id: "$_id.label",
          counts: { $push: { k: "$_id.status", v: "$count" } },
        },
      },

      // 4) turn that array into a `data` object
      {
        $project: {
          label: "$_id",
          data: { $arrayToObject: "$counts" },
        },
      },

      // 5) fill in missing statuses with 0
      {
        $addFields: {
          Submitted: { $ifNull: ["$data.Submitted", 0] },
          Accepted: { $ifNull: ["$data.Accepted", 0] },
          "In-progress": { $ifNull: ["$data.In-progress", 0] },
          Completed: { $ifNull: ["$data.Completed", 0] },
          Rejected: { $ifNull: ["$data.Rejected", 0] },
        },
      },

      // 6) drop the helper `data` field and sort by date
      {
        $project: {
          _id: 0,
          label: 1,
          Submitted: 1,
          Accepted: 1,
          "In-progress": 1,
          Completed: 1,
          Rejected: 1,
        },
      },
      { $sort: { label: 1 } },
    ];

    const result = await reportModel.aggregate(pipeline);
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: err.message });
  }
};

/* Get Status Count */
export const getStatusCounts = async (req, res) => {
  try {
    const counts = await reportModel.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      Submitted: 0,
      Accepted: 0,
      "In-progress": 0,
      Completed: 0,
      Rejected: 0,
    };

    counts.forEach((entry) => {
      result[entry._id] = entry.count;
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

// Dupa Visualization Costing Analytics
export const getDupaAnalytics = async (req, res) => {
  try {
    const { start, end } = req.query;
    const filter = {};
    if (start && end) {
      filter.timestamp = {
        $gte: new Date(start),
        $lte: new Date(end),
      };
    }

    const reports = await reportModel.find(filter).lean();

    const OUTPUT_PER_HOUR = 70;
    const labourConfig = [
      { label: "Construction Foreman", persons: 1, rate: 170.29 },
      { label: "Skilled Laborer", persons: 4, rate: 123.12 },
      { label: "Unskilled Laborer", persons: 12, rate: 94.96 },
    ];
    const equipmentConfig = [
      { label: "Transit Mixer (5 cu.m.)", units: 4, rate: 1461 },
      { label: "Concrete Vibrator", units: 2, rate: 57.17 },
      { label: "Batch Plant (30 cu.m.)", units: 1, rate: 1759.5 },
      { label: "Payloader (1.50 cu.m.)", units: 1, rate: 1733 },
      { label: "Screeder (5.5 hp)", units: 1, rate: 545 },
      { label: "Water Truck/Pump (16000 L)", units: 1, rate: 2450 },
      { label: "Concrete Saw (14' blade)", units: 1, rate: 32.64 },
      { label: "Bar Cutter", units: 1, rate: 105.47 },
    ];
    // This materialConfig now includes the missing items
    const materialConfig = [
      {
        label: "Reinforcing Steel Bar",
        unit: "kg",
        perSqm: 0.43,
        unitCost: 70.2,
      },
      { label: "Curing Compound", unit: "L", perSqm: 0.29, unitCost: 70 },
      { label: "Asphalt Sealant", unit: "L", perSqm: 0.12, unitCost: 50 },
      { label: "Steel Forms (Rental)", unit: "m", perSqm: 0.46, unitCost: 50 },
      { label: "Sand", unit: "cu.m.", perSqm: 0.1265, unitCost: 615 },
      { label: "Gravel", unit: "cu.m.", perSqm: 0.23, unitCost: 1605 },
      { label: "Cement", unit: "bag", perSqm: 2.19, unitCost: 250 },
      {
        label: "Concrete Saw Blade",
        unit: "pc",
        perSqm: 0.00015,
        unitCost: 8000,
      },
      { label: "Pipe Sleeve", unit: "m", perSqm: 0.0071, unitCost: 383.33 },
      { label: "Grease/Tar", unit: "L", perSqm: 0.0087, unitCost: 300 },
    ];

    const byDate = {};

    for (const r of reports) {
      const day = r.timestamp.toISOString().slice(0, 10);
      const area = parseFloat(r.measurement) || 0;
      const batches = area / OUTPUT_PER_HOUR;

      // Compute and accumulate raw costs without intermediate rounding
      const laborCost = labourConfig.reduce(
        (sum, c) => sum + c.persons * batches * c.rate,
        0
      );

      const rawEquipment = equipmentConfig.reduce(
        (sum, e) => sum + e.units * batches * e.rate,
        0
      );
      const equipmentCost = rawEquipment + 0.05 * laborCost;

      const materialCost = materialConfig.reduce(
        (sum, m) => sum + area * m.perSqm * m.unitCost,
        0
      );

      // Initialize or accumulate per date
      if (!byDate[day]) {
        byDate[day] = { labor: 0, equipment: 0, materials: 0 };
      }

      // Sum up raw costs here
      byDate[day].labor += laborCost;
      byDate[day].equipment += equipmentCost;
      byDate[day].materials += materialCost;
    }

    // Format and round only final daily totals
    const data = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, totals]) => ({
        label,
        laborCost: +totals.labor.toFixed(2),
        equipmentCost: +totals.equipment.toFixed(2),
        materialCost: +totals.materials.toFixed(2),
      }));

    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: err.message });
  }
};

// Function to calculate total DUPA cost from all reports
export const getTotalDupaCost = async (req, res) => {
  try {
    const reports = await reportModel.find({}).lean(); // Fetch all reports

    const OUTPUT_PER_HOUR = 70;

    const labourConfig = [
      { label: "Construction Foreman", persons: 1, rate: 170.29 },
      { label: "Skilled Laborer", persons: 4, rate: 123.12 },
      { label: "Unskilled Laborer", persons: 12, rate: 94.96 },
    ];

    const equipmentConfig = [
      { label: "Transit Mixer (5 cu.m.)", units: 4, rate: 1461 },
      { label: "Concrete Vibrator", units: 2, rate: 57.17 },
      { label: "Batch Plant (30 cu.m.)", units: 1, rate: 1759.5 },
      { label: "Payloader (1.50 cu.m.)", units: 1, rate: 1733 },
      { label: "Screeder (5.5 hp)", units: 1, rate: 545 },
      { label: "Water Truck/Pump (16000 L)", units: 1, rate: 2450 },
      { label: "Concrete Saw (14' blade)", units: 1, rate: 32.64 },
      { label: "Bar Cutter", units: 1, rate: 105.47 },
    ];

    const materialConfig = [
      {
        label: "Reinforcing Steel Bar",
        unit: "kg",
        perSqm: 0.43,
        unitCost: 70.2,
      },
      { label: "Curing Compound", unit: "L", perSqm: 0.29, unitCost: 70 },
      { label: "Asphalt Sealant", unit: "L", perSqm: 0.12, unitCost: 50 },
      { label: "Steel Forms (Rental)", unit: "m", perSqm: 0.46, unitCost: 50 },
      { label: "Sand", unit: "cu.m.", perSqm: 0.1265, unitCost: 615 },
      { label: "Gravel", unit: "cu.m.", perSqm: 0.23, unitCost: 1605 },
      { label: "Cement", unit: "bag", perSqm: 2.19, unitCost: 250 },
      {
        label: "Concrete Saw Blade",
        unit: "pc",
        perSqm: 0.00015,
        unitCost: 8000,
      },
      { label: "Pipe Sleeve", unit: "m", perSqm: 0.0071, unitCost: 383.33 },
      { label: "Grease/Tar", unit: "L", perSqm: 0.0087, unitCost: 300 },
    ];

    let totalCost = 0;

    // Loop through each report and compute individual DUPA
    for (const report of reports) {
      const area = parseFloat(report.measurement) || 0;
      const batches = area / OUTPUT_PER_HOUR;

      // Labour
      const labourTotal = labourConfig.reduce((sum, { persons, rate }) => {
        const hours = persons * batches;
        return sum + hours * rate;
      }, 0);

      // Equipment
      const equipmentBase = equipmentConfig.reduce((sum, { units, rate }) => {
        const hours = units * batches;
        return sum + hours * rate;
      }, 0);
      const minorToolsCost = labourTotal * 0.05;
      const equipmentTotal = equipmentBase + minorToolsCost;

      // Materials
      const materialTotal = materialConfig.reduce(
        (sum, { perSqm, unitCost }) => {
          const qty = perSqm * area;
          return sum + qty * unitCost;
        },
        0
      );

      // VAT (5%)
      const vat = (labourTotal + equipmentTotal + materialTotal) * 0.05;

      // Grand total for this report
      const reportTotal = labourTotal + equipmentTotal + materialTotal + vat;

      totalCost += reportTotal;
    }

    // Round the final total
    const roundedTotal = Math.round(totalCost * 100) / 100;

    res.json({ success: true, totalCost: roundedTotal });
  } catch (err) {
    console.error("Error computing total DUPA cost:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
