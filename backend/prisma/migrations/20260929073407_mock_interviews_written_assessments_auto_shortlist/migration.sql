-- AlterEnum
ALTER TYPE "AssessmentType" ADD VALUE 'WRITTEN';

-- AlterEnum
ALTER TYPE "RequirementType" ADD VALUE 'MOCK_INTERVIEW';

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "autoShortlistedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "assessment_attempts" ADD COLUMN     "feedback" JSONB;

-- AlterTable
ALTER TABLE "assessment_questions" ADD COLUMN     "maxWords" INTEGER,
ADD COLUMN     "rubric" TEXT,
ALTER COLUMN "options" SET DEFAULT '[]',
ALTER COLUMN "correctOptionIndex" SET DEFAULT -1;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "autoShortlist" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoShortlistMinScore" INTEGER NOT NULL DEFAULT 70;

-- CreateTable
CREATE TABLE "mock_interviews" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "interviewerId" TEXT,
    "conductedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "focus" TEXT,
    "technical" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "problemSolving" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mock_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mock_interviews_studentId_conductedAt_idx" ON "mock_interviews"("studentId", "conductedAt");

-- AddForeignKey
ALTER TABLE "mock_interviews" ADD CONSTRAINT "mock_interviews_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_interviews" ADD CONSTRAINT "mock_interviews_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
