require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const facultyRoutes = require("./routes/faculty");
const familyRoutes = require("./routes/family");
const categoryRoutes = require("./routes/categories");
const customFieldRoutes = require("./routes/customFields");
const excelRoutes = require("./routes/excel");
const dashboardRoutes = require("./routes/dashboard");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/faculty", facultyRoutes);
app.use("/api/family", familyRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/custom-fields", customFieldRoutes);
app.use("/api/excel", excelRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
