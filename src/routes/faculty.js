const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const { search, category, page = 1, limit = 20 } = req.query;
    const where = { isActive: true };
    if (search) {
      where.OR = [
        { itsNumber: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        {
          familyMembers: {
            some: {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }
    if (category) {
      where.categories = { some: { categoryId: category } };
    }
    const [data, total] = await Promise.all([
      prisma.faculty.findMany({ where, include: { categories: { include: { category: true } }, familyMembers: true }, skip: (page - 1) * limit, take: +limit, orderBy: { lastName: "asc" } }),
      prisma.faculty.count({ where }),
    ]);
    res.json({ data, total, page: +page, totalPages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/:id", async (req, res) => {
  try {
    const faculty = await prisma.faculty.findUnique({
      where: { itsNumber: req.params.id },
      include: {
        categories: { include: { category: true } },
        familyMembers: true,
        customValues: { include: { customField: true } },
      },
    });
    if (!faculty) return res.status(404).json({ error: "Not found" });
    res.json(faculty);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/", async (req, res) => {
  try {
    const { categoryIds, customFields: cf, ...data } = req.body;
    const faculty = await prisma.faculty.create({
      data: {
        ...data,
        categories: categoryIds?.length
          ? { create: categoryIds.map(id => ({ categoryId: id })) }
          : undefined,
      },
      include: { categories: { include: { category: true } } },
    });
    if (cf?.length) {
      await prisma.customFieldValue.createMany({
        data: cf.map(f => ({
          customFieldId: f.fieldId,
          facultyId: faculty.itsNumber,
          value: f.value,
        })),
      });
    }
    res.status(201).json(faculty);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put("/:id", async (req, res) => {
  try {
    const { categoryIds, customFields: cf, ...data } = req.body;
    if (categoryIds) {
      await prisma.facultyCategory.deleteMany({
        where: { facultyId: req.params.id },
      });
      if (categoryIds.length) {
        await prisma.facultyCategory.createMany({
          data: categoryIds.map(id => ({
            facultyId: req.params.id,
            categoryId: id,
          })),
        });
      }
    }
    const faculty = await prisma.faculty.update({
      where: { itsNumber: req.params.id },
      data,
      include: {
        categories: { include: { category: true } },
        familyMembers: true,
      },
    });
    if (cf?.length) {
      for (const f of cf) {
        await prisma.customFieldValue.upsert({
          where: {
            customFieldId_facultyId: {
              customFieldId: f.fieldId,
              facultyId: req.params.id,
            },
          },
          create: {
            customFieldId: f.fieldId,
            facultyId: req.params.id,
            value: f.value,
          },
          update: { value: f.value },
        });
      }
    }
    res.json(faculty);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/:id", async (req, res) => {
  try {
    await prisma.faculty.update({
      where: { itsNumber: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
