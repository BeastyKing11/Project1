const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get("/faculty/:facultyId", async (req, res) => {
  try {
    const members = await prisma.familyMember.findMany({
      where: { facultyId: req.params.facultyId },
      include: { customValues: { include: { customField: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(members);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/", async (req, res) => {
  try {
    const { customFields: cf, ...data } = req.body;
    const member = await prisma.familyMember.create({ data });
    if (cf?.length) {
      await prisma.customFieldValue.createMany({ data: cf.map(f => ({ customFieldId: f.fieldId, familyMemberId: member.id, value: f.value })) });
    }
    res.status(201).json(member);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put("/:id", async (req, res) => {
  try {
    const { customFields: cf, ...data } = req.body;
    const member = await prisma.familyMember.update({ where: { id: req.params.id }, data });
    if (cf?.length) {
      for (const f of cf) {
        await prisma.customFieldValue.upsert({ where: { customFieldId_familyMemberId: { customFieldId: f.fieldId, familyMemberId: req.params.id } }, create: { customFieldId: f.fieldId, familyMemberId: req.params.id, value: f.value }, update: { value: f.value } });
      }
    }
    res.json(member);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/:id", async (req, res) => {
  try {
    await prisma.familyMember.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
