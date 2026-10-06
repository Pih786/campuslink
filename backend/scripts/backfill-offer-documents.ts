// One-off: give offers created before document tracking existed the default
// checklist. Safe to re-run; offers that already have documents are skipped.
import { OfferDocumentType } from "@prisma/client";
import { prisma } from "../src/config/prisma";

const STUDENT_DOCUMENT_DAYS = 7;

async function main() {
  const offers = await prisma.offer.findMany({ where: { documents: { none: {} } } });
  for (const offer of offers) {
    const due = new Date(offer.offerDate.getTime() + STUDENT_DOCUMENT_DAYS * 24 * 60 * 60000);
    const types: OfferDocumentType[] = ["OFFER_LETTER", "SIGNED_ACCEPTANCE", "ID_PROOF", "MARKSHEETS"];
    if (offer.bondRequired) types.push("BOND_AGREEMENT");
    await prisma.offerDocument.createMany({
      data: types.map((type) => ({ offerId: offer.id, type, dueDate: type === "OFFER_LETTER" ? null : due })),
      skipDuplicates: true,
    });
  }
  console.log(`Added document checklists to ${offers.length} offer(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
