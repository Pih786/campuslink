-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('FULL_TIME', 'INTERNSHIP', 'PPO');

-- CreateEnum
CREATE TYPE "InternshipConversion" AS ENUM ('PENDING', 'CONVERTED', 'NOT_CONVERTED');

-- CreateEnum
CREATE TYPE "OfferDocumentType" AS ENUM ('OFFER_LETTER', 'SIGNED_ACCEPTANCE', 'ID_PROOF', 'MARKSHEETS', 'DEGREE_CERTIFICATE', 'BOND_AGREEMENT', 'MEDICAL_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "OfferDocumentStatus" AS ENUM ('REQUIRED', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OfferAcceptanceStatus" ADD VALUE 'DEFERRED';
ALTER TYPE "OfferAcceptanceStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "drives" ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 240;

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "conversionStatus" "InternshipConversion",
ADD COLUMN     "deferredUntil" TIMESTAMP(3),
ADD COLUMN     "offerType" "OfferType" NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnReason" TEXT;

-- CreateTable
CREATE TABLE "offer_documents" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "type" "OfferDocumentType" NOT NULL,
    "status" "OfferDocumentStatus" NOT NULL DEFAULT 'REQUIRED',
    "dueDate" TIMESTAMP(3),
    "fileUrl" TEXT,
    "fileName" TEXT,
    "note" TEXT,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_projects" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "techStack" TEXT[],
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_certifications" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedAt" TIMESTAMP(3),
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offer_documents_offerId_type_key" ON "offer_documents"("offerId", "type");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "offer_documents" ADD CONSTRAINT "offer_documents_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_projects" ADD CONSTRAINT "student_projects_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_certifications" ADD CONSTRAINT "student_certifications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
