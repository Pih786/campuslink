// Auto-shortlisting (problem statement module E). A recruiter opts in per job
// with a match-score threshold; eligible applicants who reach it move to
// SHORTLISTED on their own, and the student is told why.
//
// Guard rails:
//   * only jobs that are PUBLISHED with the rule switched on,
//   * only applications still at APPLIED/ELIGIBLE (never overrides a person),
//   * only real match scores: if the AI service is down, the fallback
//     skill-overlap score is never used to shortlist anyone,
//   * the status change is conditional, so a recruiter acting at the same
//     moment always wins.
import { ApplicationStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { aiMatch } from "../../utils/ai-client";
import { buildAiJob, buildAiStudent } from "../matching/matching.service";
import { notify, recruiterUserIdsForCompany } from "../notifications/notifications.service";

const AUTO_FROM: ApplicationStatus[] = ["APPLIED", "ELIGIBLE"];

export async function runAutoShortlist(
  jobId: string,
  opts: { applicationIds?: string[] } = {}
): Promise<{ shortlisted: number; scored: number }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { requirements: { include: { skill: true } }, company: true },
  });
  if (!job || !job.autoShortlist || job.status !== "PUBLISHED") return { shortlisted: 0, scored: 0 };

  const applications = await prisma.application.findMany({
    where: {
      jobId,
      status: { in: AUTO_FROM },
      ...(opts.applicationIds ? { id: { in: opts.applicationIds } } : {}),
    },
    include: {
      student: {
        include: {
          skills: { include: { skill: true } },
          projects: true,
          certifications: true,
          user: { select: { id: true } },
        },
      },
    },
  });

  const aiJob = buildAiJob(job);
  let shortlisted = 0;
  let scored = 0;

  for (const app of applications) {
    let score = app.matchScore;
    if (score == null) {
      const result = await aiMatch(buildAiStudent(app.student), aiJob);
      if (result.aiUnavailable) continue;
      score = result.overall;
      scored++;
      await prisma.application.update({
        where: { id: app.id },
        data: { matchScore: score, matchBreakdown: result as unknown as Prisma.InputJsonValue },
      });
    }
    if (score < job.autoShortlistMinScore) continue;

    const moved = await prisma.application.updateMany({
      where: { id: app.id, status: { in: AUTO_FROM } },
      data: { status: "SHORTLISTED", autoShortlistedAt: new Date() },
    });
    if (!moved.count) continue;
    shortlisted++;

    await prisma.analyticsEvent.create({
      data: {
        actorType: "SYSTEM",
        eventType: "AUTO_SHORTLISTED",
        entityType: "APPLICATION",
        entityId: app.id,
        metadata: { jobId, score, threshold: job.autoShortlistMinScore },
      },
    });

    await notify([app.student.user.id], {
      type: "APPLICATION_SHORTLISTED",
      title: `Shortlisted: ${job.title} at ${job.company.name}`,
      body: `Your match score of ${Math.round(score)} meets ${job.company.name}'s shortlisting threshold of ${job.autoShortlistMinScore}. The recruiter will schedule your interview next.`,
      link: "/student/applications",
    });
  }

  if (shortlisted > 0) {
    await notify(await recruiterUserIdsForCompany(job.companyId), {
      type: "APPLICATION_RECEIVED",
      title: `${shortlisted} applicant${shortlisted === 1 ? "" : "s"} auto-shortlisted for ${job.title}`,
      body: `They scored at least ${job.autoShortlistMinScore}. Review them in the pipeline.`,
      link: "/recruiter/pipeline",
    });
  }

  return { shortlisted, scored };
}
