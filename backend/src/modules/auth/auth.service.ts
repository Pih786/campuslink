import crypto from "crypto";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { hashPassword, comparePassword } from "../../utils/password";
import { signToken } from "../../utils/jwt";
import { ApiError, unauthorized, badRequest } from "../../utils/errors";
import { renderEmail, sendEmail } from "../../utils/email";
import { markPasswordChanged } from "../../utils/session";
import { notify } from "../notifications/notifications.service";
import { RegisterInput, LoginInput } from "./auth.validators";

const RESET_TOKEN_MINUTES = 30;

function userSummary(user: { id: string; email: string; fullName: string; role: string }) {
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function findUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}

async function resolveCollegeForRegistration(input: RegisterInput) {
  if (input.collegeId) {
    const college = await prisma.college.findUnique({ where: { id: input.collegeId } });
    if (!college) throw badRequest("That college wasn't found. Search again or add it.");
    return { college, created: false };
  }
  const nc = input.newCollege!;
  // Reuse an existing entry with the same name instead of creating duplicates.
  const existing = await prisma.college.findFirst({ where: { name: { equals: nc.name, mode: "insensitive" } } });
  if (existing) return { college: existing, created: false };
  const college = await prisma.college.create({
    data: { name: nc.name, city: nc.city, state: nc.state, verified: false, category: "Added by user" },
  });
  return { college, created: true };
}

async function notifyStaffRequest(collegeId: string, collegeName: string, name: string, role: "PLACEMENT_OFFICER" | "MENTOR") {
  const officers = await prisma.collegeStaff.findMany({
    where: { collegeId, status: "APPROVED", user: { role: "PLACEMENT_OFFICER" } },
    select: { userId: true },
  });
  // The first officer of a college can only be approved by a platform admin.
  const approvers =
    officers.length > 0
      ? officers.map((o) => o.userId)
      : (await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((u) => u.id);
  const label = role === "MENTOR" ? "mentor" : "placement officer";
  await notify(approvers, {
    type: "STAFF_REQUEST",
    title: `${name} wants to join ${collegeName} as ${label}`,
    body: "Review the request under Team.",
    link: officers.length > 0 ? "/placement/team" : "/admin/approvals",
  });
}

export async function registerUser(input: RegisterInput) {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new ApiError(409, "EMAIL_ALREADY_EXISTS", "An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const collegeInfo = input.role === "RECRUITER" ? null : await resolveCollegeForRegistration(input);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: { email: input.email, passwordHash, fullName: input.fullName, role: input.role },
    });

    if (input.role === "STUDENT") {
      await tx.student.create({
        data: { userId: createdUser.id, collegeId: collegeInfo!.college.id, department: input.designation },
      });
    } else if (input.role === "RECRUITER") {
      const company = await tx.company.upsert({
        where: { name: input.organization as string },
        update: {},
        create: { name: input.organization as string },
      });
      await tx.recruiter.create({
        data: { companyId: company.id, userId: createdUser.id, designation: input.designation },
      });
    } else {
      await tx.collegeStaff.create({
        data: {
          userId: createdUser.id,
          collegeId: collegeInfo!.college.id,
          designation: input.designation,
          status: "PENDING",
        },
      });
    }

    if (collegeInfo?.created) {
      await tx.college.update({ where: { id: collegeInfo.college.id }, data: { createdById: createdUser.id } });
    }
    return createdUser;
  });

  if (input.role === "PLACEMENT_OFFICER" || input.role === "MENTOR") {
    await notifyStaffRequest(collegeInfo!.college.id, collegeInfo!.college.name, user.fullName, input.role);
  }

  const token = signToken({ userId: user.id, role: user.role });
  return { user: (await getMe(user.id)).user, token };
}

export async function loginUser(input: LoginInput) {
  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const valid = await comparePassword(input.password, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const token = signToken({ userId: user.id, role: user.role });
  return { user: (await getMe(user.id)).user, token };
}

// Always answers the same way whether or not the email exists, so the
// endpoint can't be used to discover which addresses have accounts.
export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email);
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60000),
        },
      }),
    ]);

    const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    const { html, text } = renderEmail({
      heading: "Reset your CampusLink password",
      paragraphs: [
        `Hi ${user.fullName.split(" ")[0]},`,
        `We received a request to reset the password for ${user.email}. The link below works once and expires in ${RESET_TOKEN_MINUTES} minutes.`,
        "If you didn't ask for this, you can ignore this email; your password stays the same.",
      ],
      action: { label: "Choose a new password", url },
    });
    await sendEmail({ to: user.email, subject: "Reset your CampusLink password", html, text });
  }
  return {
    message: "If an account exists for that email, a reset link is on its way. It expires in 30 minutes.",
  };
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ApiError(400, "RESET_LINK_INVALID", "This reset link is invalid or has expired. Request a new one.");
  }

  const passwordHash = await hashPassword(newPassword);
  const changedAt = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash, passwordChangedAt: changedAt } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: changedAt } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } }),
  ]);
  markPasswordChanged(record.userId, changedAt);

  const { html, text } = renderEmail({
    heading: "Your password was changed",
    paragraphs: [
      `The password for ${record.user.email} was just reset, and you've been signed out on other devices.`,
      "If this wasn't you, reset your password again right away and contact your placement office.",
    ],
  });
  await sendEmail({ to: record.user.email, subject: "Your CampusLink password was changed", html, text });

  return { message: "Password updated. You can now log in with your new password." };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw unauthorized("User no longer exists");
  }

  const base = userSummary(user);

  if (user.role === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { userId },
      include: { college: true },
    });
    return {
      user: {
        ...base,
        studentId: student?.id,
        collegeId: student?.collegeId ?? null,
        collegeName: student?.college?.name ?? null,
        department: student?.department ?? null,
        cgpa: student?.cgpa ?? null,
        profileCompletion: student?.profileCompletion ?? 0,
      },
    };
  }

  if (user.role === "RECRUITER") {
    const recruiter = await prisma.recruiter.findUnique({
      where: { userId },
      include: { company: true },
    });
    return {
      user: {
        ...base,
        recruiterId: recruiter?.id,
        companyId: recruiter?.companyId ?? null,
        companyName: recruiter?.company?.name ?? null,
        designation: recruiter?.designation ?? null,
      },
    };
  }

  if (user.role === "PLACEMENT_OFFICER" || user.role === "MENTOR") {
    const staff = await prisma.collegeStaff.findUnique({ where: { userId }, include: { college: true } });
    return {
      user: {
        ...base,
        collegeId: staff?.collegeId ?? null,
        collegeName: staff?.college?.name ?? null,
        designation: staff?.designation ?? null,
        staffStatus: staff?.status ?? null,
      },
    };
  }

  return { user: base };
}
