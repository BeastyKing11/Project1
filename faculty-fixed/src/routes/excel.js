const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

function normalizeCellValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" && value.text) return String(value.text);
  if (typeof value === "object" && value.result) return String(value.result);
  return String(value);
}

function parseDateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// FIX (Bug B): Safe cell-to-string that doesn't coerce falsy values (0, false) to "".
function cellToString(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" && value.text !== undefined) return String(value.text);
  if (typeof value === "object" && value.result !== undefined) return String(value.result);
  return String(value);
}

// Map human-friendly column names to internal faculty fields.
// Keys are uppercased and trimmed before lookup.
const FACULTY_FIELD_ALIASES = {
  ITS: "itsNumber",
  "ITS NUMBER": "itsNumber",
  "FACULTY ITS": "itsNumber",
  "PHONE": "phone",
  "PHONE NUMBER": "phone",
  "PHONE NUMBER WHATSAPP": "phone",
  "WHATSAPP NUMBER": "phone",
  "EMAIL": "email",
  "FIRST NAME": "firstName",
  "LAST NAME": "lastName",
  "FIRST NAME (AR)": "firstNameAr",
  "LAST NAME (AR)": "lastNameAr",
};

router.post("/preview", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheets = [];
    workbook.eachSheet((sheet) => {
      const headers = [];
      const rows = [];
      // FIX (Bug B): use cellToString so falsy values like 0 or false aren't coerced to ""
      sheet.getRow(1).eachCell((cell, col) => {
        const val = cellToString(cell.value);
        if (val !== "") headers.push({ col, value: val });
      });

      // FIX (Bug A): count actual non-empty data rows rather than relying on
      // sheet.rowCount which can include phantom rows from ExcelJS's internal tracking.
      let actualDataRows = 0;
      const maxRow = Math.min(sheet.rowCount, 6);
      for (let i = 2; i <= sheet.rowCount; i++) {
        let rowHasData = false;
        headers.forEach(h => {
          const v = sheet.getRow(i).getCell(h.col).value;
          if (v !== null && v !== undefined && v !== "") rowHasData = true;
        });
        if (rowHasData) actualDataRows++;
        if (i <= maxRow && rowHasData) {
          const row = {};
          headers.forEach(h => {
            row[h.value] = cellToString(sheet.getRow(i).getCell(h.col).value);
          });
          rows.push(row);
        }
      }

      sheets.push({
        name: sheet.name,
        headers: headers.map(h => h.value),
        sampleRows: rows,
        totalRows: actualDataRows,
      });
    });
    res.json({ sheets });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!req.body.mapping) return res.status(400).json({ error: "No column mapping provided" });

    const mapping = JSON.parse(req.body.mapping);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];

    if (!sheet) return res.status(400).json({ error: "No worksheet found in file" });

    const customFields = await prisma.customField.findMany({
      where: { entityType: "FACULTY", isActive: true },
      select: { id: true, name: true },
    });
    const customFieldById = new Map(customFields.map(f => [f.id, f]));
    const customFieldByName = new Map(customFields.map(f => [f.name.toLowerCase(), f]));
    const headers = [];
    sheet.getRow(1).eachCell((cell, col) => {
      const val = cellToString(cell.value);
      if (val !== "") headers.push({ col, value: val });
    });

    let imported = 0;
    const errors = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      try {
        const rowData = {};
        headers.forEach(h => { rowData[h.value] = sheet.getRow(i).getCell(h.col).value; });

        const allEmpty = Object.values(rowData).every(v => v === null || v === undefined || v === "");
        if (allEmpty) continue;

        const facultyData = {};
        const customValues = [];
        Object.entries(mapping).forEach(([excelCol, dbField]) => {
          if (rowData[excelCol] !== undefined && rowData[excelCol] !== null) {
            let val = rowData[excelCol];
            let fieldKey = String(dbField || "").trim();

            const upperKey = fieldKey.toUpperCase();
            if (!fieldKey.startsWith("custom:") && FACULTY_FIELD_ALIASES[upperKey]) {
              fieldKey = FACULTY_FIELD_ALIASES[upperKey];
            }

            if (fieldKey === "dateOfBirth" || fieldKey === "hireDate") {
              val = parseDateValue(val);
            } else if (fieldKey === "gender") {
              val = String(val).toUpperCase() === "FEMALE" ? "FEMALE" : "MALE";
            } else if (fieldKey === "itsNumber") {
              // FIX (Bug D): Always stringify ITS number explicitly to preserve leading zeros.
              // ExcelJS reads numeric cells as JS numbers, so 00123 becomes 123.
              // We format it back as a string without any numeric conversion.
              val = cellToString(val);
            } else {
              val = normalizeCellValue(val);
            }

            if (String(fieldKey).startsWith("custom:")) {
              const key = String(fieldKey).replace("custom:", "");
              const field = customFieldById.get(key) || customFieldByName.get(key.toLowerCase());
              if (field) {
                // FIX (Bug C): val may already be a Date object (from parseDateValue above
                // for a custom date field). Stringify it properly instead of double-wrapping.
                const strVal = val instanceof Date ? val.toISOString() : normalizeCellValue(val);
                customValues.push({ customFieldId: field.id, value: strVal });
              }
            } else {
              facultyData[fieldKey] = val;
            }
          }
        });

        if (!facultyData.itsNumber || !facultyData.firstName || !facultyData.lastName || !facultyData.gender) {
          errors.push({ row: i, error: "Missing required fields (itsNumber, firstName, lastName, gender)" });
          continue;
        }

        const savedFaculty = await prisma.faculty.upsert({
          where: { itsNumber: facultyData.itsNumber },
          create: facultyData,
          update: facultyData,
        });

        for (const customValue of customValues) {
          await prisma.customFieldValue.upsert({
            where: {
              customFieldId_facultyId: {
                customFieldId: customValue.customFieldId,
                facultyId: savedFaculty.itsNumber,
              },
            },
            create: {
              customFieldId: customValue.customFieldId,
              facultyId: savedFaculty.itsNumber,
              value: customValue.value,
            },
            update: { value: customValue.value },
          });
        }
        imported++;
      } catch (e) { errors.push({ row: i, error: e.message }); }
    }
    res.json({ imported, errors, total: Math.max(0, sheet.rowCount - 1) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/export", async (req, res) => {
  try {
    const { format = "multi-sheet", categories, its, preview, facultyFields, includeFamily } = req.query;
    const where = { isActive: true };
    if (categories) where.categories = { some: { categoryId: { in: categories.split(",") } } };
    if (its) where.itsNumber = { in: its.split(",") };
    const [facultyCustomFields, familyCustomFields, faculty] = await Promise.all([
      prisma.customField.findMany({
        where: { entityType: "FACULTY", isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.customField.findMany({
        where: { entityType: "FAMILY", isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.faculty.findMany({
        where,
        include: {
          familyMembers: {
            include: {
              customValues: { include: { customField: true } },
            },
          },
          categories: { include: { category: true } },
          customValues: { include: { customField: true } },
        },
        orderBy: { lastName: "asc" },
      }),
    ]);

    const selectedFacultyFieldKeys = facultyFields
      ? String(facultyFields).split(",").map(s => s.trim()).filter(Boolean)
      : null;
    const withFamily = includeFamily !== "false";

    const workbook = new ExcelJS.Workbook();
    if (format === "multi-sheet") {
      const facSheet = workbook.addWorksheet("Faculty");
      let facultyColumns = [
        { header: "ITS Number", key: "itsNumber", width: 15 },
        { header: "First Name", key: "firstName", width: 20 },
        { header: "Last Name", key: "lastName", width: 20 },
        { header: "First Name (AR)", key: "firstNameAr", width: 20 },
        { header: "Last Name (AR)", key: "lastNameAr", width: 20 },
        { header: "Email", key: "email", width: 25 },
        { header: "Phone", key: "phone", width: 15 },
        { header: "Gender", key: "gender", width: 10 },
        { header: "Date of Birth", key: "dateOfBirth", width: 15 },
        { header: "Department", key: "department", width: 20 },
        { header: "Position", key: "position", width: 20 },
        { header: "Categories", key: "categories", width: 25 },
        ...facultyCustomFields.map(field => ({
          header: `Custom: ${field.label}`,
          key: `custom_${field.id}`,
          width: 24,
        })),
      ];
      if (selectedFacultyFieldKeys && selectedFacultyFieldKeys.length) {
        const allowed = new Set(selectedFacultyFieldKeys);
        facultyColumns = facultyColumns.filter(col => allowed.has(col.key));
      }
      facSheet.columns = facultyColumns;
      faculty.forEach(f => {
        const customMap = {};
        f.customValues.forEach(v => {
          customMap[`custom_${v.customFieldId}`] = v.value || "";
        });
        facSheet.addRow({
          ...f,
          ...customMap,
          dateOfBirth: f.dateOfBirth ? new Date(f.dateOfBirth).toLocaleDateString() : "",
          categories: f.categories.map(c => c.category.name).join(", "),
        });
      });

      if (withFamily) {
        const famSheet = workbook.addWorksheet("Family Members");
        famSheet.columns = [
          { header: "Faculty ITS", key: "facultyIts", width: 15 },
          { header: "Faculty Name", key: "facultyName", width: 25 },
          { header: "Relationship", key: "relationship", width: 15 },
          { header: "First Name", key: "firstName", width: 20 },
          { header: "Last Name", key: "lastName", width: 20 },
          { header: "Gender", key: "gender", width: 10 },
          { header: "Date of Birth", key: "dateOfBirth", width: 15 },
          { header: "Phone", key: "phone", width: 15 },
          ...familyCustomFields.map(field => ({
            header: `Custom: ${field.label}`,
            key: `custom_${field.id}`,
            width: 24,
          })),
        ];
        faculty.forEach(f => {
          f.familyMembers.forEach(fm => {
            const customMap = {};
            fm.customValues.forEach(v => {
              customMap[`custom_${v.customFieldId}`] = v.value || "";
            });
            famSheet.addRow({
              facultyIts: f.itsNumber,
              facultyName: `${f.firstName} ${f.lastName}`,
              ...fm,
              ...customMap,
              dateOfBirth: fm.dateOfBirth ? new Date(fm.dateOfBirth).toLocaleDateString() : "",
            });
          });
        });
      }
    } else {
      const sheet = workbook.addWorksheet("All Data");
      sheet.columns = [
        { header: "ITS Number", key: "itsNumber", width: 15 },
        { header: "First Name", key: "firstName", width: 20 },
        { header: "Last Name", key: "lastName", width: 20 },
        { header: "Email", key: "email", width: 25 },
        { header: "Phone", key: "phone", width: 15 },
        { header: "Gender", key: "gender", width: 10 },
        { header: "Department", key: "department", width: 20 },
        { header: "Family Member", key: "familyMember", width: 25 },
        { header: "Relationship", key: "relationship", width: 15 },
        ...facultyCustomFields.map(field => ({
          header: `Faculty Custom: ${field.label}`,
          key: `f_custom_${field.id}`,
          width: 24,
        })),
      ];
      faculty.forEach(f => {
        const facultyCustomMap = {};
        f.customValues.forEach(v => {
          facultyCustomMap[`f_custom_${v.customFieldId}`] = v.value || "";
        });
        if (f.familyMembers.length === 0) {
          sheet.addRow({ ...f, ...facultyCustomMap, familyMember: "", relationship: "" });
        } else {
          f.familyMembers.forEach(fm => {
            sheet.addRow({
              ...f,
              ...facultyCustomMap,
              familyMember: `${fm.firstName} ${fm.lastName}`,
              relationship: fm.relationship,
            });
          });
        }
      });
    }

    if (preview === "true") {
      const firstSheet = workbook.worksheets[0];
      const rawValues = firstSheet.getRow(1).values; // 1-indexed sparse array

      // FIX (Bug E): Track original column index alongside each header so duplicate
      // header names map to the correct column — indexOf would always return the first match.
      const headerEntries = [];
      rawValues.forEach((val, colIdx) => {
        if (val !== undefined && val !== null) {
          headerEntries.push({ colIdx, header: String(val) });
        }
      });
      const headers = headerEntries.map(e => e.header);

      const rows = [];
      const maxRow = Math.min(firstSheet.rowCount, 6);
      for (let i = 2; i <= maxRow; i++) {
        const row = {};
        headerEntries.forEach(({ colIdx, header }) => {
          row[header] = firstSheet.getRow(i).getCell(colIdx).value;
        });
        // Skip fully empty preview rows
        const isEmpty = Object.values(row).every(v => v === null || v === undefined || v === "");
        if (!isEmpty) rows.push(row);
      }

      return res.json({
        headers,
        sampleRows: rows,
        totalRows: Math.max(0, firstSheet.rowCount - 1),
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=faculty_export_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
