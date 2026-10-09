import {
  Award,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CodeXml,
  Database,
  FileText,
  GraduationCap,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  Library,
  LifeBuoy,
  MessageSquareText,
  Mic,
  ScrollText,
  ShieldCheck,
  Sparkles,
  SquareKanban,
  Target,
  UserCheck,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";

export const STUDENT_NAV = {
  portal: "Student",
  sections: [
    {
      label: "Overview",
      links: [
        { to: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/student/profile", label: "Profile", icon: UserRound },
        { to: "/student/cv", label: "CV maker", icon: ScrollText },
      ],
    },
    {
      label: "Placements",
      links: [
        { to: "/student/jobs", label: "Job matches", icon: Briefcase },
        { to: "/student/applications", label: "Applications", icon: FileText },
        { to: "/student/assignments", label: "Assignments", icon: ClipboardList },
        { to: "/student/interviews", label: "Interviews", icon: CalendarClock },
        { to: "/student/offers", label: "Offers", icon: Award },
        { to: "/student/mock-interviews", label: "Mock interviews", icon: Mic },
      ],
    },
    {
      label: "Skills",
      links: [
        { to: "/student/skill-gap", label: "Skill gap", icon: Target },
        { to: "/student/learning", label: "Learning", icon: GraduationCap },
        { to: "/student/tutor", label: "AI tutor", icon: Sparkles },
        { to: "/student/code-lab", label: "Coding lab", icon: CodeXml },
        { to: "/student/sql-lab", label: "SQL lab", icon: Database },
        { to: "/student/assessments", label: "Assessments", icon: ClipboardCheck },
        { to: "/student/skill-passport", label: "Skill passport", icon: ShieldCheck },
      ],
    },
  ],
};

export const RECRUITER_NAV = {
  portal: "Recruiter",
  sections: [
    {
      label: "Hiring",
      links: [
        { to: "/recruiter/dashboard", label: "Jobs", icon: Briefcase },
        { to: "/recruiter/pipeline", label: "Pipeline", icon: SquareKanban },
        { to: "/recruiter/assignments", label: "Assignments", icon: ClipboardList },
        { to: "/recruiter/interviews", label: "Interviews", icon: CalendarClock },
        { to: "/recruiter/offers", label: "Offers", icon: Award },
      ],
    },
    {
      label: "Insights",
      links: [{ to: "/recruiter/copilot", label: "Ask Copilot", icon: MessageSquareText }],
    },
  ],
};

export const PLACEMENT_NAV = {
  portal: "Placement office",
  sections: [
    {
      label: "Overview",
      links: [{ to: "/placement/dashboard", label: "Dashboard", icon: LayoutDashboard }],
    },
    {
      label: "Hiring",
      links: [
        { to: "/placement/pipeline", label: "Pipeline", icon: SquareKanban },
        { to: "/placement/drives", label: "Drives", icon: CalendarDays },
        { to: "/placement/interviews", label: "Interviews", icon: CalendarClock },
        { to: "/placement/offers", label: "Offers", icon: Award },
      ],
    },
    {
      label: "Directory",
      links: [
        { to: "/placement/students", label: "Students", icon: Users },
        { to: "/placement/companies", label: "Companies", icon: Building2 },
        { to: "/placement/team", label: "Team", icon: UsersRound },
      ],
    },
    {
      label: "Student support",
      links: [
        { to: "/placement/mentoring", label: "Mentoring", icon: HeartHandshake },
        { to: "/placement/mock-interviews", label: "Mock interviews", icon: Mic },
        { to: "/placement/learning", label: "Learning library", icon: Library },
      ],
    },
    {
      label: "Learning",
      links: [{ to: "/placement/lab-management", label: "Lab & assessment creation", icon: ClipboardCheck }],
    },
    {
      label: "Insights",
      links: [{ to: "/placement/copilot", label: "Ask Copilot", icon: MessageSquareText }],
    },
  ],
};

export const ADMIN_NAV = {
  portal: "Platform admin",
  sections: [
    {
      label: "Platform",
      links: [
        { to: "/admin/approvals", label: "Staff approvals", icon: UserCheck },
        { to: "/admin/colleges", label: "New colleges", icon: Landmark },
        { to: "/admin/learning", label: "Learning library", icon: Library },
        { to: "/placement/lab-management", label: "Lab & assessment creation", icon: ClipboardCheck },
      ],
    },
    {
      label: "All colleges",
      links: [
        { to: "/placement/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/placement/students", label: "Students", icon: Users },
        { to: "/placement/companies", label: "Companies", icon: Building2 },
        { to: "/placement/offers", label: "Offers", icon: Award },
        { to: "/placement/copilot", label: "Ask Copilot", icon: MessageSquareText },
      ],
    },
  ],
};

export const MENTOR_NAV = {
  portal: "Mentor",
  sections: [
    {
      label: "Overview",
      links: [{ to: "/mentor/dashboard", label: "Dashboard", icon: LayoutDashboard }],
    },
    {
      label: "Students",
      links: [
        { to: "/mentor/mentees", label: "Mentees", icon: HeartHandshake },
        { to: "/mentor/escalations", label: "Escalations", icon: LifeBuoy },
        { to: "/mentor/mock-interviews", label: "Mock interviews", icon: Mic },
        { to: "/mentor/students", label: "All students", icon: Users },
      ],
    },
    {
      label: "Resources",
      links: [{ to: "/mentor/learning", label: "Learning library", icon: Library }],
    },
  ],
};
