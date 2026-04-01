const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get("/stats", async (req, res) => {
  try {
    const [totalFaculty, totalFamily, totalCategories, genderStats, departmentStats] = await Promise.all([
      prisma.faculty.count({ where: { isActive: true } }),
      prisma.familyMember.count(),
      prisma.category.count(),
      prisma.faculty.groupBy({ by: ["gender"], where: { isActive: true }, _count: true }),
      // FIX: orderBy for grouped count must use { _count: { <groupByField>: "desc" } }
      prisma.faculty.groupBy({
        by: ["department"],
        where: { isActive: true, department: { not: null } },
        _count: { department: true },
        orderBy: { _count: { department: "desc" } },
        take: 10,
      }),
    ]);
    res.json({
      totalFaculty,
      totalFamily,
      totalCategories,
      genderStats: genderStats.map(g => ({ gender: g.gender, count: g._count })),
      // FIX: use g._count.department (specific field count) instead of g._count (boolean)
      departmentStats: departmentStats.map(d => ({ department: d.department, count: d._count.department })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/completeness", async (req, res) => {
  try {
    const faculty = await prisma.faculty.findMany({
      where: { isActive: true },
      select: {
        itsNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        dateOfBirth: true,
        department: true,
        position: true,
        nationality: true,
        maritalStatus: true
      }
    });
    const fields = ["email", "phone", "dateOfBirth", "department", "position", "nationality", "maritalStatus"];
    const results = faculty.map(f => {
      const missing = fields.filter(field => !f[field]);
      return {
        itsNumber: f.itsNumber,
        name: `${f.firstName} ${f.lastName}`,
        completeness: Math.round(((fields.length - missing.length) / fields.length) * 100),
        missingFields: missing
      };
    });
    const avgCompleteness = results.length
      ? Math.round(results.reduce((sum, r) => sum + r.completeness, 0) / results.length)
      : 0;
    res.json({ records: results, averageCompleteness: avgCompleteness });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
