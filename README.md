# CampusLink — Campus-to-Corporate Placement Platform

CampusLink runs placement seasons for many colleges on one platform. Each college is its own tenant: its students, staff, drives and numbers are visible only to that college. Students build verified profiles, recruiters post to every college or to the ones they choose and shortlist from candidates who actually qualify, and each placement office sees every application, drive, interview, offer and document for its own campus as it happens.

It covers the full cycle the problem statement asks for:

**Profiling → Matching → Scheduling → Notification → Offer tracking → Analytics**

Decisions that must be defensible (who is eligible, which drives clash) are made by deterministic rules. Ranking, parsing and question answering use scoring models and an LLM, and every score shows its reasoning.

| At a glance                            |                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Workspaces                             | Student · Recruiter · Placement office · Mentor · Platform admin                                                                    |
| Colleges                               | 227 Indian institutions preloaded (IITs, NITs, IIITs, central, state and private universities); anyone can add a missing one at sign-up |
| Match ranking (simulated data, 5 runs) | ROC AUC**0.93**, vs 0.84 skill overlap, 0.68 CGPA only, 0.50 random                                                               |
| Readiness bands                        | Observed hire rate 0.1% (Not Ready) → 3.9% → 53% → 93% (Highly Employable)                                                           |
| JD skill extraction                    | Precision 0.95, recall 1.00, F1 0.97                                                                                                    |
| Tests                                  | 48 backend + 68 AI-service automated tests, plus end-to-end API checks                                                                  |

Details and method: [docs/EVALUATION.md](docs/EVALUATION.md).

## Documentation

| Document | Read it for |
|---|---|
| [INSTALL_AND_RUN.md](INSTALL_AND_RUN.md) | Installing dependencies, configuring the database, and running all three services locally |
| [docs/FEATURES.md](docs/FEATURES.md) | **Every feature and how it works**, step by step, with its API routes and files |
| [docs/RBAC.md](docs/RBAC.md) | **Access control:** roles, tenant scoping, the full permission matrix, an access-flow diagram per feature, and known gaps |
| [docs/FILES.md](docs/FILES.md) | **What every file does** in the backend, frontend and AI service |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data model, security, deployment, multi-campus scaling |
| [docs/ALGORITHMS.md](docs/ALGORITHMS.md) | Eligibility, match score, predictive model, readiness, scheduling, risk, written scoring, Copilot |
| [docs/EVALUATION.md](docs/EVALUATION.md) | How the models were evaluated and the results |

This README is the overview; the documents above hold the detail.

## Contents

- [Features](#features)
  - [Colleges, accounts and access](#colleges-accounts-and-access)
  - [Student workspace](#student-workspace)
  - [Recruiter workspace](#recruiter-workspace)
  - [Placement office workspace](#placement-office-workspace)
  - [Mentor workspace](#mentor-workspace)
  - [Platform admin](#platform-admin)
  - [Shared capabilities](#shared-capabilities)
- [Access control (RBAC)](#access-control-rbac)
- [How the problem statement is covered](#how-the-problem-statement-is-covered)
- [Architecture and tech stack](#architecture-and-tech-stack)
- [Machine Learning: a separate predictive model](#machine-learning-a-separate-predictive-model)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Demo walkthrough](#demo-walkthrough)
- [API overview](#api-overview)
- [Project structure](#project-structure)
- [Testing and evaluation](#testing-and-evaluation)
- [Maintenance scripts](#maintenance-scripts)
- [Known limitations and roadmap](#known-limitations-and-roadmap)

---

## Features

### Colleges, accounts and access

**One platform, many colleges**

- A **college is the tenant.** Students, placement officers and mentors belong to exactly one college. Officers and mentors only ever see their own college's students, applications, drives, offers, insights and Copilot answers; records from other colleges are refused (mostly as "not found", so their existence isn't revealed; see [docs/RBAC.md](docs/RBAC.md)).
- Recruiters belong to a company and can hire from any college.

**Choosing a college at sign-up**

- A searchable picker over **227 preloaded Indian institutions** with city, state and type (IIT, NIT, IIIT, central, state, deemed and private universities, IIMs). Verified entries carry a check mark, and names that start with what you typed rank first.
- **Can't find it?** Add it with name, city and state (all 36 states and union territories). It's usable immediately and marked unverified until a platform admin checks it. Duplicates are caught case-insensitively.

**Four account types**

- **Student:** picks college and branch.
- **Recruiter:** gives a company name; the company is created or joined.
- **Placement office** and **Mentor:** pick a college and start as *pending*. Until approved they see a "Waiting for approval" screen and every college data route refuses them. The **first officer of a college is approved by a platform admin**; after that, **the college's own placement office approves** new officers and mentors.

**Jobs for all colleges or selected ones**

- When posting a job, a recruiter chooses **All colleges** or **Selected colleges** (searchable multi-select).
- A job for selected colleges is invisible to everyone else: it doesn't appear in their job lists, direct links return not found, they can't apply, and their students never enter the candidate pool.
- Jobs a placement office posts are limited to its own college.

**Passwords**

- At least 8 characters with a letter and a number.
- **Forgot password:** enter your email to receive a single-use link that expires in 30 minutes. The response is the same whether or not the account exists, and requests are rate-limited per IP and per email.
- Resetting signs you out everywhere: tokens issued before the change stop working. A confirmation email follows.
- Email goes through Resend when `RESEND_API_KEY` is set; otherwise the link is printed in the API log for development.

### Student workspace

**Dashboard**

- Greeting with branch and batch, a banner when an offer is waiting for a reply.
- Profile completeness, applications in progress, next interview and offers at a glance.
- **Readiness by role:** a 0–100 score and band for each open role (Not Ready, Developing, Ready, Highly Employable), with the skills met, below the required level and missing. Each row opens that role's skill gap.
- Roles you qualify for but haven't applied to, best match first.
- Upcoming interviews and a six-step "Next steps" checklist that matches the completeness score exactly.
- **Your mentor** (name, title, email) once the placement office assigns one, and a banner when a company assignment is waiting for submission.
- **Latest mock interview** score, linking to the full feedback.

**Profile**

- Branch chosen from a fixed list of codes (CSE, IT, ECE, EEE, ME, Civil, MCA), so branch eligibility can't silently fail on free text.
- CGPA, graduation year, active backlogs and phone, edited in place.
- Skills with self-rated levels 1–5; verified skills are marked.
- **Projects** (title, technologies, link, description). Project technologies count towards the match score for roles that need them.
- **Certifications** (name, issuer, date, credential link).
- **Resume upload (PDF, DOCX or TXT).** Text is extracted and skills, projects and certifications found in it are added without overwriting anything already set. The student is told exactly what was added. Resumes are stored privately.

**CV maker**

- For students who don't have a CV: a first draft is **filled in from the profile** (education, skills with verified ones first, projects with their descriptions split into bullet points, certifications, and verified assessment scores as achievements).
- Edit contact details and links, summary, education, skills, experience, projects, certifications and achievements, with a **live preview** beside the form.
- **Draft with AI** writes a 2–3 sentence summary from the CV's own facts, with no invented employers, numbers or awards. Without an LLM key a template summary is built from the same facts.
- Two templates (**Classic** and **Modern**). **Download as PDF or Word (.docx)**; both are text-based, so applicant tracking systems can read them.
- **Use as my resume** saves the PDF as the student's resume. Skills, projects and certifications typed into the CV that aren't on the profile yet are added to it, with no duplicates on repeat saves.

**Job matches**

- Every open role that is open to the student's college, split into **Eligible** and **Not eligible yet**.
- Eligible roles show location, job type, salary range, deadline, match score, skills the student has and skills to learn, and an Apply button.
- Every card explains itself in a sentence, e.g. *"Not eligible: your CGPA, branch and backlogs meet the criteria, but the role requires Docker and Kubernetes, which aren't on your profile."*
- A requirement-by-requirement checklist with the real values ("CGPA 8.1 meets the 6.5 minimum"), and for eligible roles the match score broken down by factor.
- Search, sort by best match or closing date, and hide roles already applied to.

**Skill gap**

- Compare against any role, including ones the student isn't eligible for yet.
- Skills covered vs required, skills to build, and links to the coding lab, SQL lab and assessments to prove them.
- **Learn the missing skills:** one tab per missing skill with library material, **video suggestions** and a shortcut to the AI tutor.

**Learning**

- **Improve my match:** the skills that open roles ask for and the student lacks (missing, or below the required level), ranked by how many roles need them. Each shows the roles, library material and progress.
- **Video suggestions** per skill: beginner courses for missing skills, advanced topics and interview questions for weak ones. With a `YOUTUBE_API_KEY` these are real videos (cached for 12 hours per skill); without one, ready-made YouTube searches.
- **Library** of 39 curated free resources across 25+ skills (official docs, freeCodeCamp, Kaggle Learn, Google, Khan Academy, NPTEL, LeetCode, HackerRank and more), plus anything the college adds. Search and filter by type.
- Track each item as **Saved**, **Started** or **Done**; **My list** groups them.

**AI tutor**

- A chat tutor for any topic, or focused on one skill, with starter prompts ("Explain … with a small example", "Quiz me").
- Grounded on the library: it only recommends material from the student's library and cites it, never invented links. The cited items are listed under the answer.
- For company assignments it explains concepts and approach but won't write the finished solution. Rate-limited per student.

**Assignments**

- Take-home tasks from companies, with instructions, due date (time left) and maximum score.
- Submit a written answer, a link (repo, notebook, deployed app) and/or a file (up to 15 MB, stored privately). Resubmit until the due date or until it's reviewed.
- See the score and the recruiter's feedback once reviewed.

**Applications, interviews, offers**

- Applications with status and match score, filtered by in progress or closed.
- Interviews with round, time, duration, venue, panel and meeting link, upcoming and past.
- Offers: accept, decline, or **ask for more time** with a decide-by date and a note. Offer type (full-time, internship, pre-placement offer), CTC, joining date and bond are shown. Withdrawn offers show the employer's reason.
- **Joining documents:** upload the signed acceptance, ID proof, marksheets and anything else requested, see due dates and overdue items, read the reviewer's note when something is sent back, and download the offer letter.

**Practice and verified skills**

- **Coding lab:** Monaco editor in JavaScript, Python, Java or C++. Run the examples, then submit against hidden tests executed by Judge0. Passing records verified evidence.
- **SQL lab:** read the schema and sample data, run queries in a sandbox, and compare your output with the expected result.
- **Assessments:** timed tests with a sticky timer, answered-count progress, auto-submit at zero and a warning before submitting with unanswered questions. Two kinds:
  - **Multiple choice** (e.g. the quantitative aptitude test), marked against the answer key.
  - **Written** (e.g. professional communication): free-text answers with a live word count, scored by the LLM from 0 to 10 on **clarity, structure, grammar and relevance** against a rubric, with per-answer feedback. Answers are passed to the model as data, never as instructions. If the LLM is unavailable a rule-based check gives a clearly labelled **provisional** score (capped at 7/10 per criterion) that never verifies a skill; if the AI service is unreachable the attempt stays open and the student is asked to submit again.
- **Mock interviews:** every practice interview the placement office or mentor recorded, with technical, communication, problem-solving and confidence scores (0–10), the overall score, feedback and the change since the last round.
- **Skill passport:** every skill with its level, verified badge and the evidence behind it (source, score, date).

### Recruiter workspace

**Jobs**

- Open roles, applications, interviews and accepted offers for the recruiter's company.
- Role list with status, closing date, and links to candidates and pipeline, plus the company's hiring funnel.
- **Post a job:** role, location, type, salary in LPA, deadline, **which colleges can see it (all, or selected ones)**, minimum CGPA, maximum backlogs, eligible branches, an optional **minimum mock-interview score** (required or preferred), required and preferred skills with minimum levels, and a description. The jobs table shows each role's audience.
- **Auto-shortlisting (opt-in per job):** "shortlist eligible applicants scoring 70 or more". It runs when a student applies, when the rule is switched on or changed, and on **Recalculate**. Each student is told why ("Your match score of 78 meets Kaveri FinTech's shortlisting threshold of 70"), recruiters get a count, and fallback scores from an unreachable AI service are never used to shortlist.
- **Start from a job description:** paste a JD and the form is pre-filled, with the filled fields highlighted for review. Skills are kept only if they appear in the JD text.

**Candidates (per job)**

- **Screening summary:** how many students were checked, how many are eligible and ranked, and how many each requirement excluded ("Missing AWS · 6", "CGPA below 6.5 · 5").
- **Auto-shortlist rule:** switch it on or off and set the threshold from the candidates page.
- Ranked candidates with branch, CGPA, email, match score, matched and missing skills.
- Why each candidate ranks where they do ("Strong on skills, academics. Ranked above Neha mainly on projects").
- The score broken down by factor and weight.
- Resume download for students who have applied.
- **Predictive likelihood (experimental):** a collapsed-by-default panel below the ranked list, powered by a real trained model that's completely separate from the match score above — it never affects ranking, shortlisting or eligibility. Expanding it shows each eligible candidate's predicted likelihood plus, on request, exactly how the model was trained and evaluated (see [Machine Learning](#machine-learning-a-separate-predictive-model)).

**Pipeline**

- A drag-and-drop board from Applied to Joined. Moves that aren't allowed are refused instantly, and moves that need details open a form.
- Card actions: shortlist, schedule interview, add round, select, make offer, mark joined or did not join, reject (with confirmation).
- **Scheduling interviews:** checks student and panel double-booking and offers the next free slot.
- **Making an offer:** full-time, internship or pre-placement offer, with CTC or stipend, role, location, joining date and bond.
- Search and job filter, a live refresh indicator, and resume download on cards.
- Cards show each candidate's assignment status or score; **Send assignment** is one click from a shortlisted card. Candidates the rule shortlisted carry an **Auto-shortlisted** tag.

**Assignments**

- Create a take-home assignment for a job: title, instructions, due date and maximum score, sent to chosen candidates (all, shortlisted only, or hand-picked).
- Candidates are notified and their application moves to **Assessment**.
- Per assignment: submitted, reviewed and average score; each submission's answer, link and file; **score with feedback** (capped at the maximum). Add more candidates, close or reopen.

**Interviews and offers**

- Interview agenda grouped by day, with record outcome (attended with a 0–10 score, or no-show, plus feedback), reschedule and cancel.
- Offers with acceptance and joining rates, average CTC and documents to review. Filters: awaiting reply, deferred, accepted, declined, withdrawn, documents to review.
- Offer actions: withdraw with a reason, record an internship outcome (convert to a pre-placement offer or not), and mark joining.
- **Document review:** upload the offer letter, verify submitted documents, send one back with a note, and request additional documents.

**Ask Copilot**

- Plain-English questions about the company's own hiring, answered only from its data, including its take-home assignments.

### Placement office workspace

**Placement overview**

- **Headline figures:** students registered, placed and placement rate. Also the share who are **placement-ready** (60+ readiness for at least one role), offers by status, and upcoming drives.
- **Students at risk of staying unplaced**, ranked, each with the reasons ("Hasn't applied to any role yet", "Not eligible for any open role", "Missed 1 interview"). One click sends the student those reasons with next steps.
- **Placement funnel** from applied to joined, with stage-to-stage conversion.
- **Branch-wise conversion:** students, applied, placed and placement rate per branch.
- **Skills in demand:** roles needing each skill, students who have it, and their placement rate (labelled as an observed pattern, not cause).
- **Readiness by role:** how many students are in each band for every open role.
- **Packages:** average, median and highest CTC; average and highest by company; month-by-month trend once offers span several months.
- **Recruiter engagement:** open roles, drives, applications, offers, accepted, joined, last activity, Active or Idle, and repeat hirer.
- **Offers, joining and documents summary:** awaiting reply, deferred, declined, withdrawn, pre-placement offers, joined, joining pending, documents awaiting review, not submitted, overdue and verified.

**Drives**

- Create a drive for a company and role with start time, duration, venue, capacity and registration deadline.
- **Live clash check while filling the form:**
  - Venue double-booking is blocked.
  - Overlapping drives that share students in process are flagged, with their names.
  - Plain overlaps are noted.
  - The next clash-free slot is offered as one click.
- Drive announcements go to students who meet the role's criteria, and to the company's recruiters.
- Check an existing drive for venue, shared-student and interview-panel clashes.

**Directory**

- Students: search, branch filter, CGPA, backlogs, batch and profile completeness.
- Companies: industry, location, website and status.

**Team**

- Approve or decline officers and mentors who ask to join the college, and see the current team.

**Mentoring**

- **At-risk students** (from the risk model) with each one's reasons, mentor and escalation status.
- **Assign a mentor** or **escalate** to a mentor with a note. The escalation keeps a snapshot of the risk score and factors, and the mentor is notified. One open escalation per student.
- Follow escalations to resolution (the mentor's resolution note comes back to the office), see every mentored student, and each mentor's caseload.

**Mock interviews**

- Record a practice interview for any student: four scores from 0 to 10 (technical, communication, problem solving, confidence), an optional skill tested, focus and feedback. The student is notified and sees it on their own page.
- A score of 6 or more records **verified evidence** for Communication (and for the skill tested), the same as passing a lab.
- The **latest** score is what job benchmarks check, and a latest score below 5 adds to the at-risk score. Students with no mock interview are not penalised.
- Summary of students assessed, average latest score, how many are below 5 and how many haven't had one.

**Learning library**

- Add college-specific material (course, docs, article, practice or video) for any skill; the college's students see it in their plan and the tutor can cite it. Remove your own college's items.

**Also available to the office:** the college-wide pipeline, interviews, offers and documents, and Copilot. Everything is limited to the officer's own college.

### Mentor workspace

For faculty mentors, approved by their college's placement office.

- **Dashboard:** mentees, how many are at risk, open escalations, follow-ups due this week, placed; escalations to handle and upcoming follow-ups.
- **Mentees:** each student's profile completeness, applications, risk, escalation and next follow-up, sortable by risk or follow-up date.
- **Student page:** profile summary, skills, applications, offers, learning progress, escalation history and the risk reasons, plus **notes with optional follow-up dates**, shared with the placement office. Email the student or download their resume.
- **Escalations:** start working, then resolve with a note on what changed.
- **Mock interviews:** record one from the student page or the Mock interviews page, and see every mentee's latest score.
- Read access to the college's student directory and learning library.

### Platform admin

- **Staff approvals** across all colleges, flagged when the request is a college's first officer or comes from an unverified college.
- **New colleges:** verify, correct, or **merge** a duplicate into the right entry (students, staff, drives, job targets and resources move over).
- The platform-wide dashboard, students, companies, offers and Copilot, and the shared learning library.
- Admin accounts are created from the command line (`scripts/create-admin.ts`), never through sign-up.

### Shared capabilities

**Notifications**

- An in-app bell with an unread count, polled every 30 seconds and on window focus. Mark one or all as read; clicking opens the relevant page.
- Sent for:
  - new applicants (to recruiters)
  - shortlisted, selected and rejected
  - interview scheduled, rescheduled and cancelled
  - drive announced
  - offer received, response (including deferral), withdrawn, internship converted
  - document requested, uploaded, verified or sent back
  - document due soon or overdue
  - no reply to an offer after 3 days (to recruiters and officers)
  - placement-office nudges to at-risk students
  - staff sign-up requests (to the college's officers, or to admins for a first officer) and the decision
  - mentor assigned (to mentor and student), escalations and their resolution
  - assignment received, submitted and reviewed
- Reminders run hourly and are never repeated to the same person within a day.
- **Also emailed** (through Resend, when `RESEND_API_KEY` is set): shortlisted, selected, rejected; interview scheduled, rescheduled, cancelled; offer received, withdrawn, follow-ups; document requested, reviewed and deadline reminders; drives; assignments; mock interviews; placement-office nudges, escalations and staff decisions. Each email carries a button to the relevant page. `EMAIL_NOTIFICATIONS=off` turns email off while keeping in-app notifications. Seeded demo accounts (`@demo.campuslink.dev`) are never emailed.

**Placement Copilot**

- Available to officers (their own college), recruiters (own company only) and admins (whole platform).
- Answers come from a fresh, role-scoped snapshot of platform data: funnel, conversion, skill supply vs demand, departments, companies, offers and documents, drives and top applicants. Officers also get learning progress and mentoring figures; recruiters get their assignments.
- Every number in an answer is checked against that data, and anything it can't trace is flagged.
- "Show data used" reveals the snapshot.
- Rate-limited per user. If the LLM is busy it says so plainly.

**Design and accessibility**

- A consistent design system: IBM Plex Sans and Mono, a single blue accent, and colour reserved for status.
- Light and dark themes, following the OS until the user picks one.
- Responsive from phone to desktop: the sidebar becomes a slide-out menu, modals become bottom sheets and tables scroll inside their cards.
- Keyboard focus rings, labelled controls, screen-reader text for icon buttons and reduced-motion support.

**Security and privacy**

- JWT authentication with role checks on every route. **Tenant isolation in the service layer:** officers and mentors are scoped to their college, recruiters to their company, students to themselves, in every query (students, jobs, candidates, pipeline, interviews, offers, drives, insights, Copilot data). Checked end to end by an automated cross-college test.
- Staff accounts do nothing until approved. Changing a password revokes older sessions. Sign-up, login and password reset are rate-limited.
- Resumes, offer documents and assignment files are stored outside any public folder and only streamed after an access check. Recruiters can open a resume only after the student applies to one of their roles.
- Student code runs in Judge0, never in the API. SQL runs under a read-only database role that can't see application tables, limited to a single `SELECT`/`WITH` with a timeout.
- LLM output is checked before use, and LLM endpoints are rate-limited.
- Secrets live only in git-ignored `.env` files.

---

## Access control (RBAC)

Every request passes three checks on the backend: a valid, current login token; a role allowed for that route; and a **scope** check that limits the records to the caller's college, company or own data. The frontend hides screens a role can't use, but the backend is the only enforcement point.

| Role | Scope | Can | Can't |
|---|---|---|---|
| **Student** | Themselves; jobs open to their college | Build a profile and CV, apply to eligible roles, practise in labs and assessments, answer offers, upload documents, submit assignments, see their mock interviews | See other students, post jobs, move applications |
| **Recruiter** | Their company; only students who applied | Post jobs to all or selected colleges, rank candidates, run the pipeline, schedule interviews, make offers, review documents, set assignments, ask Copilot | See students who haven't applied, touch another company's jobs, create drives |
| **Placement officer** | Their college (after approval) | Everything at their college: pipeline, drives, interviews, offers, analytics, at-risk nudges, mentoring, mock interviews, staff approvals, learning material, lab content, Copilot | See another college's data |
| **Mentor** | Their college (after approval); acts on assigned or escalated students | Mentee pages, notes and follow-ups, escalations, mock interviews, learning material | Move applications, make offers, schedule interviews or drives, see the placement overview |
| **Admin** | The whole platform (created from the command line only) | Approve first officers, verify and merge colleges, platform dashboards, shared learning material | Mentoring actions |

Officers and mentors start **pending** and can't reach any college data until approved: the first officer of a college by a platform admin, later staff by the college's officers.

The full permission matrix (all 135 API routes), how scope is resolved, one access-flow diagram per feature and the known gaps are in **[docs/RBAC.md](docs/RBAC.md)**.

---

## How the problem statement is covered

| Problem statement area                                                                                                                            | Where it lives                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student readiness profiling (resume, academics, projects, certifications, branch/CGPA/backlogs, skill gaps)                                       | Profile, resume parsing, readiness by role, skill gap, skill passport                                                                                                      |
| Aptitude and assessment scores                                                                                                                    | Timed MCQ assessments (quantitative aptitude), coding and SQL labs; interview scores recorded by recruiters                                                                |
| Mock-interview scores and communication / soft-skill assessment                                                                                   | Mock interviews recorded by the office or mentors (feed eligibility benchmarks, readiness evidence and risk); written communication assessment scored by the LLM          |
| Recruiter requirement matching (JD parsing, skills, branch/CGPA eligibility, project relevance)                                                   | JD analyzer, eligibility engine, match score, candidates page                                                                                                              |
| Fit score with reasons for shortlisting or not                                                                                                    | Student verdict sentences and checklists (including "your mock-interview score (5.5/10) is below the 7/10 benchmark"); recruiter screening summary, score breakdown and ranking notes |
| Automated shortlisting                                                                                                                            | Opt-in per-job auto-shortlist rule with the reason sent to each student                                                                                                    |
| Readiness levels Not Ready → Highly Employable                                                                                                   | Readiness bands on the student dashboard and the office overview                                                                                                           |
| Conflict-free drive scheduling (same slot, venue, shared students, panels)                                                                        | Drive clash check with next-slot suggestion; interview student and panel checks                                                                                            |
| Offer, CTC, bonds, documentation and verification, PPOs, internship conversion, deferral and withdrawal                                           | Offers and documents                                                                                                                                                       |
| Analytics (branch- and skill-wise conversion, package trends, at-risk students, recruiter engagement and repeat hiring)                           | Placement overview                                                                                                                                                         |
| Communication and notification automation                                                                                                         | In-app notifications, email for shortlists, interviews, offers and document deadlines, and hourly reminders                                                                |
| Workflow automation (auto-scheduling around conflicts, preparation recommendations, document reminders, at-risk escalation, recruiter follow-ups) | Next-slot suggestion, learning plan with videos and AI tutor, reminders, at-risk nudges and escalation to mentors, offer follow-ups                                        |
| Company-specific assignments                                                                                                                      | Recruiter assignments with submissions, scores and feedback                                                                                                                |
| Multi-campus deployment                                                                                                                           | College tenancy, college-targeted jobs, per-college approval, platform admin                                                                                               |
| Placement command dashboard                                                                                                                       | Placement overview                                                                                                                                                         |
| Minimum deliverables 8–12 (architecture, models, simulated dataset demo, evaluation, multi-campus scaling)                                       | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ALGORITHMS.md](docs/ALGORITHMS.md), [docs/EVALUATION.md](docs/EVALUATION.md), `ai-service/eval/`, the demo season from `scripts/seed-demo.ts`, multi-college tenancy |

---

## Architecture and tech stack

```
frontend/     React 19 + Vite 8 single-page app (five role workspaces)
backend/      Node.js + Express + TypeScript + Prisma — the only service that touches the database
ai-service/   Python + FastAPI — match scoring, readiness, resume/JD parsing, Copilot, CV summary, AI tutor (stateless)
docs/         Architecture, algorithms and evaluation
```

The browser talks only to the backend (`/api/v1`). The backend calls the AI service (`/ai/...`) with a 5-second timeout and falls back to an equivalent in-process scorer if it's unreachable, so the platform keeps working with only the frontend and backend running.

| Layer             | Technology                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend          | React 19, Vite 8, React Router 7, lucide-react icons, Monaco editor, IBM Plex fonts, plain CSS with design tokens                                   |
| Backend           | Node.js, Express, TypeScript, Prisma 5, zod, JWT, multer, unpdf (PDF text), mammoth (DOCX text), pdfkit and docx (CV export)                        |
| AI service        | Python 3.12, FastAPI, Pydantic, httpx                                                                                                               |
| Database          | PostgreSQL (hosted on Neon in development)                                                                                                          |
| External services | Judge0 CE (code execution), Groq (`openai/gpt-oss-120b`, falls back to `gpt-oss-20b`), Resend (email, optional), YouTube Data API v3 (optional) |

Full diagram, data model, deployment and multi-campus design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). How each algorithm works: [docs/ALGORITHMS.md](docs/ALGORITHMS.md).

---

## Machine Learning: a separate predictive model

Matching and eligibility above are a **rule + LLM hybrid** by design — decisions that must be defensible (who's eligible, who ranks where) are deterministic rules or a documented fixed-weight formula, not a black box. That's a deliberate choice, not a gap, and it's one of the technology combinations the problem statement itself names as acceptable ("Rule + AI Hybrid Models," "Large Language Models").

Alongside that, there's a genuinely separate, additive piece of classical Machine Learning: a **trained logistic regression model** that predicts placement likelihood, living entirely in its own module (`ai-service/app/ml/`, `backend/src/modules/predictive/`) with its own API route (`POST /ml/placement-likelihood`) and its own UI panel. It never touches eligibility, the match score, `Application.matchScore`, or candidate ranking — a recruiter opens it as a second opinion, not the primary screening tool.

- **Trained on** 6 simulated placement seasons (~13,000 eligible candidate-role pairs), **evaluated on** 2 different, never-trained-on seasons — there's no real historical placement data yet, and the problem statement explicitly permits simulated data for this (deliverable #10).
- **Features:** the same six sub-scores the hand-set match formula already computes (skill match, academics, projects, certifications, assessment proxy, experience), plus one new signal the fixed formula can't express — the share of required skills a student has *verified*, not just declared.
- **Result on held-out data:** AUC 0.951 vs. the hand-set formula's 0.941 on the identical test set; Precision@10 of 1.00 vs. 0.70. Full numbers, method and honest caveats: [docs/EVALUATION.md §1a](docs/EVALUATION.md#1a-predictive-model-vs-the-hand-set-formula-held-out-seasons).
- **Explainable:** logistic regression's coefficients are inspectable feature importances, shown to the recruiter on request (`GET /predictive/model-info`), not a black box.
- **Degrades safely:** if the model file isn't present, every call returns "unavailable" — never an error, never a fallback that silently affects a real decision.

To (re)train it: `cd ai-service && pip install -r requirements-train.txt && python -m app.ml.train`. Full write-up: [docs/ALGORITHMS.md §2a](docs/ALGORITHMS.md#2a-predictive-placement-likelihood-separate-additive).

---

## Getting started

### Prerequisites

- **Node.js 22.12 or newer.** The production build loads the ESM-only PDF parser through `require`, which needs this version; development mode works on older versions.
- **Python 3.11 or newer.**
- **A PostgreSQL database**, either a local install or a hosted one such as Neon. No Docker required.

### 1. AI service (Python)

```powershell
cd ai-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env     # optional: set GROQ_API_KEY to enable the LLM features
uvicorn app.main:app --reload --port 8000
```

Check it: `curl http://localhost:8000/health` → `{"status":"ok"}`.

### 2. Backend (Node.js)

```powershell
cd backend
npm install
Copy-Item .env.example .env
# edit .env: set DATABASE_URL and a strong JWT_SECRET
npx prisma generate
npx prisma migrate deploy                # applies all migrations
npx tsx scripts/setup-sql-lab-role.ts    # one-time: creates the SQL Lab's read-only role;
                                         # put the printed URL in .env as SQL_LAB_DATABASE_URL
npx prisma db seed                       # optional: demo college, 18 skills, 3 companies with a job each
npx tsx scripts/setup-tenancy.ts         # loads the 227 colleges; moves any pre-tenancy data to the demo college
npx tsx scripts/seed-learning.ts         # loads the curated learning library
npx tsx scripts/create-admin.ts admin@example.com "<password>" "Platform Admin"
npx tsx scripts/seed-demo.ts             # optional: a full demo season (see Demo walkthrough); run with the AI service up
npm run dev                              # http://localhost:5000
```

The server starts and serves `/health` even without a reachable database; database routes return `503 DATABASE_UNAVAILABLE` until `DATABASE_URL` works.

For production: `npm run build` then `npm start`.

### 3. Frontend (React)

```powershell
cd frontend
npm install
Copy-Item .env.example .env   # VITE_API_URL defaults to http://localhost:5000/api/v1
npm run dev                   # http://localhost:5173
```

### Adding lab content

Coding problems, SQL problems and assessments are created by a placement officer (or admin) through the API:

- `POST /api/v1/coding/problems`
- `POST /api/v1/sql/problems`
- `POST /api/v1/assessments`

There is no authoring screen yet.

---

## Configuration

| Service    | Variable                 | Purpose                                                                                                                                                                                                                  |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| backend    | `DATABASE_URL`         | PostgreSQL connection string                                                                                                                                                                                             |
| backend    | `JWT_SECRET`           | Signing key for login tokens; use a long random value                                                                                                                                                                    |
| backend    | `PORT`                 | API port (default 5000)                                                                                                                                                                                                  |
| backend    | `AI_SERVICE_URL`       | AI service base URL (default`http://localhost:8000`)                                                                                                                                                                   |
| backend    | `JUDGE0_URL`           | Judge0 instance; the free public one is rate-limited, so self-host for real use                                                                                                                                          |
| backend    | `SQL_LAB_DATABASE_URL` | Connection string for the read-only SQL Lab role                                                                                                                                                                         |
| backend    | `CORS_ORIGIN`          | Frontend origin allowed to call the API                                                                                                                                                                                  |
| backend    | `APP_URL`              | Public frontend URL used in emailed links (defaults to`CORS_ORIGIN`)                                                                                                                                                   |
| backend    | `RESEND_API_KEY`       | Sends password-reset and notification emails through Resend. Empty: no email is sent, and the reset link is printed in the API log instead. |
| backend    | `EMAIL_NOTIFICATIONS`  | `off` stops notification emails (in-app notifications continue). Default `on`. Password-reset emails are unaffected. |
| backend    | `EMAIL_FROM`           | Sender address.`onboarding@resend.dev` only delivers to the Resend account owner; verify your own domain in Resend for real users.                                                                                     |
| backend    | `YOUTUBE_API_KEY`      | Optional. Real video suggestions per skill (YouTube Data API v3). Empty: suggestions are YouTube search links.                                                                                                           |
| frontend   | `VITE_API_URL`         | Backend API base URL                                                                                                                                                                                                     |
| ai-service | `PORT`                 | AI service port (default 8000)                                                                                                                                                                                           |
| ai-service | `GROQ_API_KEY`         | Enables LLM-backed JD analysis, the Copilot, the AI tutor and AI CV summaries. Without it, JD analysis uses the rule-based parser, CV summaries use a template, and the Copilot and tutor report themselves unavailable. |
| ai-service | `GROQ_MODEL`           | Optional model override                                                                                                                                                                                                  |

Free-tier Groq keys allow roughly 8,000 tokens per minute per model; one Copilot answer uses about 3,000. JD analysis is limited to 20 requests per 10 minutes per user and the Copilot to 30.

**Files:** resumes, offer documents and assignment submissions are written to `backend/private-uploads/`, which is git-ignored. Back it up alongside the database.

---

## Demo walkthrough

**Quick start with the seeded season.** `npx tsx scripts/seed-demo.ts` (from `backend/`, with the AI service running) loads 46 students across two colleges and five branches, recruiters for every company, 4 extra roles, applications at every pipeline stage with interviews and offers (documents due), 5 upcoming drives, mock interviews, aptitude results, a written communication assessment, mentor assignments and escalations. It takes about 5 minutes against a remote database and can be re-run: it deletes only what it created. Every demo password is `Demo@2026`:

| Role             | Login                                               | Try                                                                                                                              |
| ---------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Student          | `student@demo.campuslink.dev`                       | Offer awaiting a reply with documents due, an upcoming interview, mock-interview feedback, the written communication assessment |
| Recruiter        | `recruiter@demo.campuslink.dev`                     | Kaveri FinTech: **Backend Engineer** has auto-shortlisting on; open its candidates and pipeline                                 |
| Recruiter        | `recruiter.sahyadri@demo.campuslink.dev`            | Sahyadri Systems: the Embedded role requires a mock-interview score of 6/10                                                     |
| Mentor           | `mentor@demo.campuslink.dev`                        | Mentees at risk, escalations, recording a mock interview                                                                        |
| Placement office | `officer@campuslink.dev` (from `prisma db seed`)    | Overview, at-risk list, drives, Mock interviews                                                                                 |
| Placement office | `officer.pune@demo.campuslink.dev`                  | A second college: none of the first college's data is visible                                                                   |

Other students are `firstname.lastname@demo.campuslink.dev` (e.g. `rohan.deshmukh@demo.campuslink.dev`). Demo accounts never receive email.

**From scratch:**

1. **Placement office:** sign up as Placement office and pick your college (or add it). You'll see "Waiting for approval"; log in as the platform admin, approve the request on **Staff approvals**, then click **Check again**.
2. **Recruiter:** sign up as a Recruiter (company name creates the company), open **Jobs → Post a job**, paste a job description and click **Extract requirements**, choose **All colleges** or pick colleges, review the highlighted fields and publish.
3. **Student:** sign up as a Student at the same college with your branch, add CGPA, graduation year and phone on **Profile**. Either upload a resume (PDF, DOCX or TXT) or open **CV maker**, check the draft built from your profile, click **Draft with AI** for the summary, download PDF and Word, and **Use as my resume**.
4. **Student:** open **Job matches**. The **Eligible** tab shows ranked roles with a breakdown; **Not eligible yet** says exactly what's missing. Apply to a role, then check **Readiness by role** on the dashboard.
5. **Student:** open **Learning** to see the skills to work on with material and videos, and ask the **AI tutor** a question. Solve a **Coding lab** problem or take an **Assessment**; the verified skill shows up on the **Skill passport** and raises readiness.
6. **Recruiter:** open the job's **Candidates** to see the screening summary and ranked, explained candidates. In **Pipeline**, shortlist the student and click **Send assignment**; after the student submits it on **Assignments**, score it with feedback. Then schedule an interview (try a clashing time to see the next-slot suggestion), select, and make an offer.
7. **Student:** open the bell to see the notifications, then **Offers**. Ask for more time or accept, and upload the requested documents.
8. **Recruiter or officer:** in **Offers**, verify a document or send one back with a note, and upload the offer letter.
9. **Mentor:** sign up as Mentor at the college; approve them on the officer's **Team** page. On **Mentoring**, escalate an at-risk student to the mentor, then as the mentor add a note with a follow-up date and resolve the escalation.
10. **Placement office:** on **Drives**, create a drive in a venue that's already booked to see the clash and the one-click next slot. Open **Placement overview** for readiness, conversion, packages, recruiter engagement and at-risk students, and send one of them next steps. Log in as a student of another college to confirm none of this is visible there.
11. **Anyone with Copilot:** ask "Which skills have the largest campus shortage?" and open **Show data used**.

---

## API overview

All routes are under `/api/v1` and, except auth, need `Authorization: Bearer <token>`.

| Area               | Main routes                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth               | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/forgot-password`, `POST /auth/reset-password`                                                                                                                                                                                                                                         |
| Colleges           | `GET /colleges?q=&state=` (public), `GET /colleges/states`, `GET /colleges/:id`, `GET /colleges/staff-requests`, `POST /colleges/staff-requests/:id/review`, `GET /colleges/mine/staff`, `GET /colleges/unverified`, `PATCH /colleges/:id`, `POST /colleges/:id/merge`                                                                                                      |
| Students           | `GET/PUT /students/me`, `POST /students/me/skills`, `POST /students/me/resume`, `GET /students/me/resume/file`, `POST/DELETE /students/me/projects`, `POST/DELETE /students/me/certifications`, `GET /students/me/skill-gaps`, `GET /students/me/readiness`, `GET /students/me/skill-passport`, `GET /students`, `GET /students/:id`, `GET /students/:id/resume/file` |
| Companies and jobs | `GET/POST /companies`, `GET/POST /jobs`, `GET/PUT /jobs/:id`                                                                                                                                                                                                                                                                                                                            |
| Matching           | `GET /matching/student/me/jobs[?include=all]`, `GET /matching/job/:jobId/candidates`, `POST /matching/job/:jobId`                                                                                                                                                                                                                                                                       |
| Applications       | `GET/POST /applications`, `PATCH /applications/:id`                                                                                                                                                                                                                                                                                                                                       |
| Drives             | `GET/POST /drives`, `POST /drives/check`, `GET /drives/:id`, `GET /drives/:id/conflicts`                                                                                                                                                                                                                                                                                              |
| Interviews         | `GET/POST /interviews`, `PATCH /interviews/:id`                                                                                                                                                                                                                                                                                                                                           |
| Offers             | `GET/POST /offers`, `GET/PATCH /offers/:id`, `POST /offers/:id/respond`, `POST /offers/:id/withdraw`, `POST /offers/:id/conversion`, `POST /offers/:id/documents`, `POST /offers/:id/documents/:documentId/upload`, `POST /offers/:id/documents/:documentId/review`, `GET /offers/:id/documents/:documentId/file`, `POST /offers/reminders/run`                           |
| Notifications      | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`                                                                                                                                                                                                                                                               |
| Analytics          | `GET /analytics/overview`, `GET /analytics/funnel`, `GET /analytics/insights`, `POST /analytics/at-risk/:studentId/nudge`                                                                                                                                                                                                                                                             |
| Labs               | `/coding/problems`, `/sql/problems`, `/assessments` (list, detail, run/submit or attempt; `type` is `MCQ` or `WRITTEN`)                                                                                                                                                                                                                                                                                               |
| CV maker           | `GET/PUT /cv/me`, `GET /cv/me/prefill`, `GET /cv/me/export/pdf`, `GET /cv/me/export/docx`, `POST /cv/me/save-as-resume`, `POST /cv/me/suggest-summary`                                                                                                                                                                                                                            |
| Learning           | `GET/POST /learning/resources`, `DELETE /learning/resources/:id`, `PUT /learning/resources/:id/progress`, `GET /learning/me`, `GET /learning/plan`, `GET /learning/videos?skill=&mode=`, `POST /learning/tutor`, `GET /learning/students/:studentId`                                                                                                                          |
| Mentoring          | `GET /mentoring/me`, `GET /mentoring/mentors`, `POST /mentoring/assignments`, `DELETE /mentoring/assignments/:studentId`, `GET /mentoring/at-risk`, `GET/POST /mentoring/escalations`, `PATCH /mentoring/escalations/:id`, `GET /mentoring/mentees`, `GET /mentoring/overview`, `GET /mentoring/students/:studentId`, `GET/POST /mentoring/students/:studentId/notes`   |
| Assignments        | `GET/POST /assignments`, `GET/PATCH /assignments/:id`, `POST /assignments/:id/candidates`, `GET /assignments/mine`, `POST /assignments/submissions/:id/submit`, `POST /assignments/submissions/:id/review`, `GET /assignments/submissions/:id/file`                                                                                                                             |
| Mock interviews    | `GET /mock-interviews/me` (student), `GET /mock-interviews[?studentId=]`, `POST /mock-interviews` (officer or mentor) |
| Predictive (ML)    | `GET /predictive/jobs/:jobId/candidates`, `GET /predictive/model-info` — separate from Matching above; see [Machine Learning](#machine-learning-a-separate-predictive-model)                                                                                                                                                                                                     |
| AI                 | `POST /ai/jobs/analyze` (JD analysis), `POST /copilot/query`                                                                                                                                                                                                                                                                                                                              |

Responses use `{ data }`, `{ data, pagination }` or, on error, `{ success: false, error: { code, message, ... } }`.

---

## Project structure

```
frontend/src/
  components/     ui primitives, layout (app shell, notifications), student, recruiter, pipeline, offers, labs,
                  learning, cv, assignments, mentoring, staff, college picker
  pages/          student/, recruiter/, placement/, mentor/, admin/, shared/ (pipeline, interviews, offers, copilot, library), auth/
  context/        auth, theme, toasts
  lib/            formatting, status labels and tones, branch codes
  styles/         tokens → base → components → layout → landing → auth → features → modules
backend/
  prisma/         schema, migrations, seed, data/ (college directory, learning library)
  src/modules/    one folder per domain (routes, controller, service, validators); predictive/ is separate from matching/
  src/utils/      tenancy scoping, AI client with fallbacks, ml-client (separate, predictive model only), uploads, resume text, email, YouTube
  scripts/        setup and maintenance scripts
  tests/          unit and property tests
ai-service/
  app/api/        FastAPI routes, including predictive.py (mounted at /ml, separate from matching.py's /ai/match)
  app/logic/      scoring, readiness, extraction, JD analysis, Copilot (CV summary and tutor live in app/api/)
  app/ml/         the separate predictive model: simulation, features, train.py, serve.py, model.json
  app/skills/     skill dictionary and aliases
  eval/           offline evaluation of the matching engine (python -m eval.evaluate)
  tests/          pytest suite
docs/             FEATURES.md, RBAC.md, FILES.md, ARCHITECTURE.md, ALGORITHMS.md, EVALUATION.md
```

---

## Testing and evaluation

```powershell
cd backend;    npm test                     # 48 tests: eligibility + explanations, fallback scorers, drive clashes (incl. 500-schedule property test), risk scoring, CV rendering, video fallback, skill-name matching, mock-interview benchmarks
cd ai-service; pytest                       # 68 tests: scoring, readiness, parsing, LLM grounding, Copilot number checks, CV summary, tutor grounding, written-answer scoring, predictive model (never calls the real LLM)
cd ai-service; python -m eval.evaluate      # matching engine: ranking accuracy, readiness calibration, JD parsing accuracy, throughput
cd ai-service; python -m app.ml.train       # separate predictive model: trains + evaluates on held-out simulated seasons
cd frontend;   npm run build                # production build
```

Results and method are in [docs/EVALUATION.md](docs/EVALUATION.md).

---

## Maintenance scripts

Run from `backend/`. All are safe to re-run.

| Script                                                          | Purpose                                                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npx tsx scripts/setup-sql-lab-role.ts`                       | Create the SQL Lab's read-only database role                                                                         |
| `npx tsx scripts/setup-tenancy.ts [collegeName]`              | Load the college directory; attach officers, drives and students without a college to the default college (APPROVED) |
| `npx tsx scripts/merge-duplicate-skills.ts [--dry-run]` | Merge skills that differ only in case or spacing ("java" into "Java") so eligibility matches them |
| `npx tsx scripts/seed-learning.ts`                            | Load or refresh the curated learning library                                                                         |
| `npx tsx scripts/seed-demo.ts`                                | Load the demo season (`@demo.campuslink.dev` accounts, two demo companies, a second demo college); re-running replaces it |
| `npx tsx scripts/create-admin.ts <email> <password> "<name>"` | Create or update a platform admin account                                                                            |
| `npx tsx scripts/normalize-branches.ts`                       | Convert old free-typed branches ("B.Tech CSE") to the codes eligibility uses ("CSE")                                 |
| `npx tsx scripts/backfill-offer-documents.ts`                 | Add the default document checklist to offers created before document tracking                                        |
| `npx tsx scripts/move-resumes-private.ts`                     | Move resumes uploaded before private storage out of the old public folder                                            |
| `npx tsx scripts/measure-latency.ts <email> <password>`       | Measure p50/p95 latency of the heavier endpoints                                                                     |

---

## Known limitations and roadmap

**Current limitations**

- **Certifications** are shown to recruiters but don't add to match scores until a verification step exists.
- **The matching engine's weights are hand-set** (40/20/10/10/10/10), as are the at-risk risk points. A separate, additive predictive model now exists that learns these weights instead (see [Machine Learning](#machine-learning-a-separate-predictive-model)), but it's trained on simulated seasons and needs a real season of outcomes before it should inform a real decision; the matching engine itself is unchanged.
- **Email needs a verified sender.** With Resend's test sender (`onboarding@resend.dev`) mail only reaches the Resend account owner; verify a domain for real users. There's no SMS or WhatsApp delivery.
- **Mock interviews are recorded by staff,** not conducted in the platform; the score is whatever the interviewer gives.
- **Learning progress is self-reported.** Marking material done doesn't change a match score; students still prove a skill in the labs or assessments.
- **Per-college settings** (branch list, readiness threshold, document checklist) are still platform-wide constants.
- **Access-control gaps** are listed in [docs/RBAC.md](docs/RBAC.md#known-gaps-and-inconsistencies) (for example, non-student roles can list every lab submission and assessment attempt). Fix them before loading real student data.
- **Recruiters can't attach coding or SQL problems to an assignment yet;** assignments are free-form and scored by hand, and lab content is created by the placement office through the API.
- **Speed:** with the database far from the API, heavy pages take about 2 seconds. Deploying the API in the database's region fixes this (see [docs/EVALUATION.md](docs/EVALUATION.md#api-latency)).
- **Single instance assumed:** the hourly reminder job and the 30-second insights cache live inside the API process, so a multi-instance deployment should move them to a scheduled job and a shared cache.
- **Lab content** is created through the API only.

**Not built yet**

- [ ] SMS and WhatsApp delivery of notifications
- [ ] Per-college settings table
- [ ] University-level role that compares colleges
- [ ] Authoring screens for lab content
