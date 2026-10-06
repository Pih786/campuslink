import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  BarChart3,
  BellRing,
  Briefcase,
  Check,
  ClipboardList,
  CodeXml,
  FileText,
  FlaskConical,
  GraduationCap,
  HeartHandshake,
  Landmark,
  ListChecks,
  Lock,
  MessageSquareText,
  Scale,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import Logo from "../components/common/Logo";
import ThemeToggle from "../components/common/ThemeToggle";
import { CampusVisual, ExplainVisual, HeroVisual, ScheduleVisual, SidebarMock } from "../components/landing/LandingVisuals";
import {
  ADMIN_NAV,
  MENTOR_NAV,
  PLACEMENT_NAV,
  RECRUITER_NAV,
  STUDENT_NAV,
} from "../components/layout/navigation";

const FACTS = [
  { value: "227", label: "Indian colleges preloaded, and anyone can add theirs" },
  { value: "5", label: "Workspaces: student, recruiter, placement office, mentor, admin" },
  { value: "6", label: "Stages covered, from profiling through to analytics" },
  { value: "0.93", label: "ROC AUC ranking eventual hires, on simulated seasons" },
];

const FLOW = [
  { title: "Profiling", text: "Academics, skills, projects and resume, with lab and test results as verified evidence." },
  { title: "Matching", text: "Hard eligibility rules first, then a match score that shows its reasons." },
  { title: "Scheduling", text: "Drives and interviews checked for venue, student and panel clashes." },
  { title: "Notification", text: "Shortlists, interview slots, offers and document deadlines, sent automatically." },
  { title: "Offer tracking", text: "CTC, bonds, PPOs, deferrals, documents and joining status per offer." },
  { title: "Analytics", text: "Conversion by branch and skill, package trends and students at risk." },
];

const WORKSPACES = [
  {
    key: "student",
    label: "Students",
    icon: GraduationCap,
    nav: STUDENT_NAV,
    summary: "Know which roles you qualify for, why, and what to learn next.",
    points: [
      "Job matches split into eligible and not-yet, each with the exact reason",
      "Readiness for every role, from Not Ready to Highly Employable",
      "A CV maker that starts from your profile, with PDF and Word export",
      "A learning plan, videos and an AI tutor for every missing skill",
      "Coding lab, SQL lab and timed assessments that verify what you know",
    ],
    cta: "Sign up as a student",
  },
  {
    key: "recruiter",
    label: "Recruiters",
    icon: Briefcase,
    nav: RECRUITER_NAV,
    summary: "Post once — to every college or the ones you choose — and work only with candidates who meet the bar.",
    points: [
      "Paste a job description and the requirements fill themselves in",
      "Ranked candidates with the breakdown behind every score",
      "A drag-and-drop pipeline from applied to joined",
      "Take-home assignments with submissions, scores and feedback",
      "Offers, documents and joining tracked against each hire",
    ],
    cta: "Sign up as a recruiter",
  },
  {
    key: "office",
    label: "Placement office",
    icon: Landmark,
    nav: PLACEMENT_NAV,
    summary: "See your college's whole season as it happens, with nothing to reconcile.",
    points: [
      "Funnel, branch-wise conversion and package trends",
      "Drives checked for venue, shared-student and panel clashes",
      "Students at risk of staying unplaced, with the reasons why",
      "Approve your college's staff and faculty mentors",
      "Plain-English answers from live data with Ask Copilot",
    ],
    cta: "Sign up as placement staff",
  },
  {
    key: "mentor",
    label: "Mentors",
    icon: HeartHandshake,
    nav: MENTOR_NAV,
    summary: "Support the students who need it most, with the full picture in front of you.",
    points: [
      "Mentees ordered by placement risk, with next follow-ups",
      "Escalations from the placement office, resolved with a note",
      "Shared notes and follow-up dates, visible to the office",
      "Each mentee's applications, skills and learning progress",
    ],
    cta: "Sign up as a mentor",
  },
  {
    key: "admin",
    label: "Admins",
    icon: ShieldCheck,
    nav: ADMIN_NAV,
    summary: "Keep the college directory and staff approvals in order across the platform.",
    points: [
      "Approve the first placement officer of each college",
      "Verify, correct or merge colleges added at sign-up",
      "A platform-wide dashboard and the shared learning library",
    ],
    note: "Admin accounts are created by the CampusLink team.",
  },
];

const CAPABILITIES = [
  { icon: FileText, title: "Resume parsing", text: "PDF, DOCX or TXT. Skills, projects and certificates are added without overwriting yours." },
  { icon: ScrollText, title: "CV maker", text: "A first draft from the profile, an AI-drafted summary, and PDF and Word downloads." },
  { icon: CodeXml, title: "Coding and SQL labs", text: "Hidden tests and a read-only SQL sandbox turn practice into verified skills." },
  { icon: Target, title: "Skill gap and learning", text: "Missing skills ranked by how many roles need them, with free courses and videos." },
  { icon: Sparkles, title: "AI tutor", text: "Explains concepts step by step and cites only your library, never invented links." },
  { icon: ClipboardList, title: "Company assignments", text: "Take-home tasks with text, link or file submissions, scored with feedback." },
  { icon: Award, title: "Offers and documents", text: "CTC, bonds, PPOs, deferrals and joining, with document verification." },
  { icon: HeartHandshake, title: "Mentoring", text: "At-risk students escalated to faculty mentors and followed to resolution." },
  { icon: BellRing, title: "Notifications", text: "Shortlists, interviews, offers and deadlines reach the right person, with reminders." },
  { icon: BarChart3, title: "Placement analytics", text: "Branch and skill conversion, package trends and recruiter engagement." },
  { icon: MessageSquareText, title: "Ask Copilot", text: "Plain-English answers from live data. Figures it can't trace are flagged." },
  { icon: FlaskConical, title: "Predictive likelihood", text: "An experimental trained model, shown apart from the match score, never used to rank." },
];

const PRINCIPLES = [
  {
    icon: Scale,
    title: "Rules decide eligibility",
    text: "CGPA, branch, backlog and skill cut-offs are fixed rules. No score, model or LLM can override them.",
  },
  {
    icon: ListChecks,
    title: "Every score explains itself",
    text: "Matched skills, gaps and the weight of each factor are visible to students and recruiters alike.",
  },
  {
    icon: Landmark,
    title: "Each college is its own tenant",
    text: "Officers and mentors see only their college. Jobs can be limited to the colleges a recruiter chooses.",
  },
  {
    icon: Lock,
    title: "Private by default",
    text: "Resumes, offer documents and submissions are served only after an access check on every request.",
  },
];

function WorkspaceTabs() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef([]);
  const ws = WORKSPACES[active];
  const Icon = ws.icon;

  // Arrow keys move between tabs, as in any standard tab list.
  const onKeyDown = (e) => {
    const last = WORKSPACES.length - 1;
    let next = null;
    if (e.key === "ArrowRight") next = active === last ? 0 : active + 1;
    else if (e.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="lp-ws">
      <div className="lp-ws-tabs" role="tablist" aria-label="Workspaces">
        {WORKSPACES.map((w, i) => {
          const TabIcon = w.icon;
          return (
            <button
              key={w.key}
              ref={(el) => (tabRefs.current[i] = el)}
              type="button"
              role="tab"
              id={`ws-tab-${w.key}`}
              aria-selected={i === active}
              aria-controls={`ws-panel-${w.key}`}
              tabIndex={i === active ? 0 : -1}
              className="lp-ws-tab"
              onClick={() => setActive(i)}
              onKeyDown={onKeyDown}
            >
              <TabIcon aria-hidden="true" />
              {w.label}
            </button>
          );
        })}
      </div>

      <div
        className="lp-ws-panel"
        role="tabpanel"
        id={`ws-panel-${ws.key}`}
        aria-labelledby={`ws-tab-${ws.key}`}
        tabIndex={0}
      >
        <div className="lp-ws-copy">
          <span className="lp-ws-icon">
            <Icon aria-hidden="true" />
          </span>
          <h3>{ws.label}</h3>
          <p>{ws.summary}</p>
          <ul className="lp-ticks">
            {ws.points.map((p) => (
              <li key={p}>
                <Check aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
          {ws.cta ? (
            <Link className="btn btn-primary" to="/signup">
              {ws.cta}
              <ArrowRight />
            </Link>
          ) : (
            <p className="lp-ws-note">{ws.note}</p>
          )}
        </div>
        <div className="lp-ws-visual">
          <span className="lp-ws-caption">{ws.nav.portal} workspace menu</span>
          <SidebarMock nav={ws.nav} />
        </div>
      </div>
    </div>
  );
}

function SectionHead({ kicker, title, children, center = false }) {
  return (
    <div className={`lp-section-head ${center ? "is-center" : ""}`}>
      <span className="lp-kicker">{kicker}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div className="lp">
      <a className="lp-skip" href="#main">
        Skip to content
      </a>

      <header className="lp-header">
        <div className="lp-container lp-header-inner">
          <Logo />
          <nav className="lp-nav" aria-label="Sections">
            <a href="#lifecycle">How it works</a>
            <a href="#campuses">Colleges</a>
            <a href="#workspaces">Workspaces</a>
            <a href="#features">Features</a>
            <a href="#principles">Principles</a>
          </nav>
          <div className="lp-header-actions">
            <ThemeToggle />
            <Link className="btn btn-ghost lp-login" to="/login">
              Log in
            </Link>
            <Link className="btn btn-primary" to="/signup">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="lp-container lp-hero">
          <div className="lp-hero-copy">
            <span className="lp-kicker">Placement management for colleges across India</span>
            <h1>
              Run the placement season from <span className="lp-accent">one shared record.</span>
            </h1>
            <p className="lp-lede">
              Students build verified profiles. Recruiters post to every college or just the ones they choose, and
              shortlist only candidates who qualify. The placement office sees every application, drive, interview and
              offer as it happens, with a reason behind every decision.
            </p>
            <div className="lp-cta">
              <Link className="btn btn-primary btn-lg" to="/signup">
                Create an account
                <ArrowRight />
              </Link>
              <Link className="btn btn-secondary btn-lg" to="/login">
                Log in
              </Link>
            </div>
            <ul className="lp-audience" aria-label="Who it's for">
              <li>Students</li>
              <li>Recruiters</li>
              <li>Placement offices</li>
              <li>Faculty mentors</li>
            </ul>
          </div>
          <HeroVisual />
        </section>

        <section className="lp-container" aria-label="At a glance">
          <dl className="lp-facts">
            {FACTS.map((f) => (
              <div key={f.label} className="lp-fact">
                <dt className="lp-mono">{f.value}</dt>
                <dd>{f.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="lifecycle" className="lp-section">
          <div className="lp-container">
            <SectionHead kicker="How it works" title="One season, six stages">
              The cycle every campus already runs, with the spreadsheets, email chains and WhatsApp groups taken out.
            </SectionHead>
            <ol className="lp-flow">
              {FLOW.map((step, i) => (
                <li key={step.title} className="lp-flow-step">
                  <span className="lp-flow-num lp-mono">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-section-alt">
          <div className="lp-container lp-split">
            <div className="lp-split-copy">
              <span className="lp-kicker">Explainable matching</span>
              <h2>A reason behind every decision</h2>
              <p>
                Nobody gets a bare "Not shortlisted." Eligibility is checked by fixed rules against the role's real
                requirements, and the result reads like a sentence a placement officer would write.
              </p>
              <ul className="lp-ticks">
                <li>
                  <Check aria-hidden="true" />
                  Students see every requirement they meet and the ones they don't
                </li>
                <li>
                  <Check aria-hidden="true" />
                  Recruiters see how many students each requirement excluded
                </li>
                <li>
                  <Check aria-hidden="true" />
                  Each gap links straight to a learning plan for that skill
                </li>
              </ul>
            </div>
            <ExplainVisual />
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-container lp-split lp-split-reverse">
            <div className="lp-split-copy">
              <span className="lp-kicker">Conflict-free scheduling</span>
              <h2>Drives that don't collide</h2>
              <p>
                Clashes are caught while the drive is being set up, not on the morning of. Double-booked venues are
                refused outright, and the next free slot is one click away.
              </p>
              <ul className="lp-ticks">
                <li>
                  <Check aria-hidden="true" />
                  Venue double-booking is blocked
                </li>
                <li>
                  <Check aria-hidden="true" />
                  Students in process for two overlapping drives are flagged by name
                </li>
                <li>
                  <Check aria-hidden="true" />
                  Interview panels and candidates can't be booked twice
                </li>
              </ul>
            </div>
            <ScheduleVisual />
          </div>
        </section>

        <section id="campuses" className="lp-section lp-section-alt">
          <div className="lp-container lp-split">
            <div className="lp-split-copy">
              <span className="lp-kicker">Every college in India</span>
              <h2>Built for every campus, not just one</h2>
              <p>
                Each college is its own space: its students, staff, drives and numbers stay with it. Pick yours from 227
                preloaded institutions at sign-up, or add it in a minute.
              </p>
              <ul className="lp-ticks">
                <li>
                  <Check aria-hidden="true" />
                  Recruiters post to every college or only the ones they choose
                </li>
                <li>
                  <Check aria-hidden="true" />
                  New staff are approved by their own college's placement office
                </li>
                <li>
                  <Check aria-hidden="true" />
                  Colleges added at sign-up are verified, and duplicates merged
                </li>
              </ul>
            </div>
            <CampusVisual />
          </div>
        </section>

        <section id="workspaces" className="lp-section">
          <div className="lp-container">
            <SectionHead kicker="Workspaces" title="Five workspaces, one set of facts" center>
              Each role gets its own view, but they all read and write the same applications, interviews and offers.
            </SectionHead>
            <WorkspaceTabs />
          </div>
        </section>

        <section id="features" className="lp-section lp-section-alt">
          <div className="lp-container">
            <SectionHead kicker="Features" title="Everything a placement cell runs on">
              From the first profile to the joining date, without leaving the platform.
            </SectionHead>
            <ul className="lp-caps">
              {CAPABILITIES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="lp-cap">
                  <Icon aria-hidden="true" />
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="principles" className="lp-principles">
          <div className="lp-container">
            <SectionHead kicker="Principles" title="Built to be trusted with careers">
              Placement decisions shape where people start their working lives. These are the rules the platform holds
              itself to.
            </SectionHead>
            <div className="lp-principles-grid">
              {PRINCIPLES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="lp-principle">
                  <Icon aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-container">
            <div className="lp-final">
              <figure className="lp-photo lp-photo-final">
                <img
                  src="/images/students-group.jpg"
                  alt="A group of students laughing together around a table"
                  width="1100"
                  height="733"
                  loading="lazy"
                />
              </figure>
              <div className="lp-final-body">
                <h2>Bring your next placement drive onto CampusLink</h2>
                <p>
                  Pick your college at sign-up. Staff accounts are approved by your college's placement office, and a
                  college's first officer by the CampusLink team.
                </p>
                <div className="lp-final-actions">
                  <Link className="btn btn-primary btn-lg" to="/signup">
                    Create an account
                    <ArrowRight />
                  </Link>
                  <Link className="btn btn-secondary btn-lg" to="/login">
                    Log in
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <Logo />
              <p>Campus-to-corporate placement management for colleges across India.</p>
            </div>
            <nav className="lp-footer-col" aria-label="Product">
              <span>Product</span>
              <a href="#lifecycle">How it works</a>
              <a href="#campuses">Colleges</a>
              <a href="#workspaces">Workspaces</a>
              <a href="#features">Features</a>
              <a href="#principles">Principles</a>
            </nav>
            <nav className="lp-footer-col" aria-label="Account">
              <span>Account</span>
              <Link to="/signup">Create an account</Link>
              <Link to="/login">Log in</Link>
              <Link to="/forgot-password">Forgot password</Link>
            </nav>
          </div>
          <div className="lp-footer-bottom">
            <span>© {year} CampusLink</span>
            <span>
              Photos by{" "}
              <a href="https://unsplash.com/photos/iQPr1XkF5F0" target="_blank" rel="noreferrer">
                Javier Trueba
              </a>
              ,{" "}
              <a href="https://unsplash.com/photos/Wobgby4RX38" target="_blank" rel="noreferrer">
                Suraj Anandan
              </a>{" "}
              and{" "}
              <a href="https://unsplash.com/photos/LCwo5opgr9M" target="_blank" rel="noreferrer">
                Sanket Mishra
              </a>{" "}
              on Unsplash
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
