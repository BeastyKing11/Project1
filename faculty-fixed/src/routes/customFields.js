const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticate, requireAdmin } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const { entityType } = req.query;
    const where = entityType ? { entityType } : {};
    const fields = await prisma.customField.findMany({ where, include: { categoryMappings: { include: { category: true } } }, orderBy: { sortOrder: "asc" } });
    res.json(fields);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { categoryIds, ...data } = req.body;
    if (data.options && Array.isArray(data.options)) data.options = JSON.stringify(data.options);
    const field = await prisma.customField.create({
      data: { ...data, categoryMappings: categoryIds?.length ? { create: categoryIds.map(id => ({ categoryId: id })) } : undefined },
      include: { categoryMappings: { include: { category: true } } },
    });
    res.status(201).json(field);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { categoryIds, ...data } = req.body;
    if (data.options && Array.isArray(data.options)) data.options = JSON.stringify(data.options);
    if (categoryIds) {
      await prisma.fieldCategoryMapping.deleteMany({ where: { customFieldId: req.params.id } });
      if (categoryIds.length) await prisma.fieldCategoryMapping.createMany({ data: categoryIds.map(id => ({ customFieldId: req.params.id, categoryId: id })) });
    }
    const field = await prisma.customField.update({ where: { id: req.params.id }, data, include: { categoryMappings: { include: { category: true } } } });
    res.json(field);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await prisma.customField.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
