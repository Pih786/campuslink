# File guide

What every source file in the repository does. For how the pieces work together see [FEATURES.md](FEATURES.md); for access rules see [RBAC.md](RBAC.md).

Contents: [Repository layout](#repository-layout) · [backend/](#backend) · [frontend/](#frontend) · [ai-service/](#ai-service) · [docs/](#docs)

## Repository layout

```
backend/      Node.js + Express + TypeScript + Prisma. The only service that touches the database.
frontend/     React 19 + Vite single-page app with five role workspaces.
ai-service/   Python + FastAPI. Scoring, parsing, LLM features and the predictive model. Stateless.
docs/         Architecture, algorithms, evaluation, features, files, access control.
```

Each backend domain lives in `backend/src/modules/<name>/` with the same four parts:

| File | Role |
|---|---|
| `<name>.routes.ts` | URL, allowed roles (`requireRole`), rate limits, upload middleware, body validation |
| `<name>.controller.ts` | Reads the request, calls the service, sends `{ data }` (some small modules put handlers in the routes file) |
| `<name>.service.ts` | Business rules and tenant scoping; all database access |
| `<name>.validators.ts` | zod schemas for request bodies |

---

## backend/

### Root

| File | What it does |
|---|---|
| `package.json` | Scripts: `dev` (tsx watch), `build` (tsc), `start`, `test` (node:test), `prisma:seed` |
| `tsconfig.json` | TypeScript: CommonJS, ES2020, strict |
| `.env.example` | Every environment variable, documented (copy to `.env`) |

### backend/src

| File | What it does |
|---|---|
| `app.ts` | Builds the Express app: CORS, JSON body parsing, `GET /health`, mounts the 24 module routers under `/api/v1`, then the 404 and error handlers |
| `server.ts` | Starts the server on `PORT` and the hourly offer-reminder job |

### backend/src/config

| File | What it does |
|---|---|
| `env.ts` | Reads and defaults every environment variable (`DATABASE_URL`, `JWT_SECRET`, `AI_SERVICE_URL`, `JUDGE0_URL`, `SQL_LAB_DATABASE_URL`, `CORS_ORIGIN`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_NOTIFICATIONS`, `YOUTUBE_API_KEY`, `PORT`) |
| `prisma.ts` | The shared Prisma client (lazy connect) and transaction timeouts (wait 10 s, run 20 s) |
| `sql-lab-prisma.ts` | A second Prisma client bound to the read-only `sql_lab_runner` role, used only to run student SQL |

### backend/src/middleware

| File | What it does |
|---|---|
| `auth.ts` | `requireAuth`: verifies the Bearer JWT and rejects tokens issued before the last password change. `requireRole(...)`: 403 unless the caller's role is listed |
| `errorHandler.ts` | Turns `ApiError`s and Prisma errors into `{ success:false, error }` (duplicate → 409, not found → 404, database down → 503) and unknown routes into 404 |
| `rateLimit.ts` | In-memory sliding-window limits: `rateLimitPerUser` (AI features) and `rateLimitByKey` (login, sign-up and reset by IP or email) |
| `validate.ts` | `validateBody(schema)`: zod validation that replaces `req.body` with the parsed value, or 400 with per-field details |

### backend/src/utils

| File | What it does |
|---|---|
| `tenancy.ts` | Tenant scoping: `resolveScope` (college, company or admin per role; blocks unapproved staff), `studentsInScope`, `applicationsInScope`, `offersInScope`, `jobsVisibleToCollege`, `assertStudentInCollege`, `officerUserIdsForCollege` |
| `errors.ts` | `ApiError` and helpers: `notFound`, `forbidden`, `badRequest`, `unauthorized`, `conflict`, `notEligible` |
| `jwt.ts` | Signs and verifies login tokens (7 days) |
| `session.ts` | `isTokenCurrent` / `markPasswordChanged`: revokes tokens after a password change (60-second cache) |
| `password.ts` | bcrypt hash and compare |
| `asyncHandler.ts` | Forwards errors from async route handlers to the error handler |
| `pagination.ts` | `?page=&limit=` parsing (default 20, max 100) and the paginated response shape |
| `email.ts` | Sends email through Resend (logs instead without a key) and renders the HTML and text email template |
| `ai-client.ts` | Calls the AI service (match, resume, JD, readiness, skill gap, Copilot, CV summary, tutor, written scoring) with timeouts; every call returns `null` on failure, with Node fallbacks for match and readiness |
| `ml-client.ts` | Separate client for the predictive model (`/ml/*`), 4-second timeout, "unavailable" on failure |
| `judge0-client.ts` | Runs code on Judge0 for the coding lab (JavaScript, Python, Java, C++) |
| `sql-guard.ts` | Allows only a single `SELECT`/`WITH` statement and blocks dangerous keywords (the database role is the real boundary) |
| `upload.ts` | multer storage for resumes, offer documents and assignment files in `private-uploads/`, with type and size limits |
| `resume-text.ts` | Extracts text from PDF (unpdf), DOCX (mammoth) and TXT resumes |
| `youtube.ts` | Video suggestions per skill (YouTube Data API with a 12-hour cache, or search links) |
| `india.ts` | The 36 Indian states and union territories, for the "add your college" form |

### backend/src/modules

| Module | Files | What it does |
|---|---|---|
| `auth` | routes, controller, service, validators | Sign-up (student, recruiter, officer, mentor), login, `me`, logout, forgot and reset password. Creates the role profile, sets staff to PENDING and notifies approvers; single-use hashed reset tokens |
| `students` | routes, controller, service, validators | Student profile, skills, projects, certifications, resume upload with parsing, resume download with access checks, profile completeness, skill gaps, readiness, skill passport; scoped student list for staff and recruiters |
| `companies` | routes, controller, service, validators | Company list, detail and profile upsert |
| `jobs` | routes, controller, service, validators | Create, list, view and edit jobs; audience (all or selected colleges), typed requirements, auto-shortlist rule; officers limited to their own college |
| `eligibility` | service | Pure eligibility engine: `checkEligibility`, `explainEligibility`, converters from database rows |
| `matching` | routes, controller, service | Student job matches and recruiter candidate ranking: builds the candidate pool, applies eligibility, scores through the AI service, saves scores onto applications, screening summary |
| `applications` | routes, controller, service, validators, `auto-shortlist.ts` | Apply (visibility, eligibility, duplicates), scoped lists, stage transitions with notifications; `runAutoShortlist` |
| `interviews` | routes, controller, service, validators | Schedule, reschedule, cancel and record interviews; student and panel clash detection with next-slot suggestion |
| `drives` | routes, controller, service, validators, `drive-conflicts.ts` | Placement drives: live clash check, creation with announcements, conflict report; `drive-conflicts.ts` is the pure clash detector and slot finder |
| `offers` | routes, controller, service, validators, `offer-documents.service.ts`, `offer-reminders.ts` | Offer creation with document checklist, student response and deferral, withdrawal, internship conversion, joining; document upload, review and requests; the hourly reminder job |
| `assignments` | routes, service | Company take-home assignments: create, choose candidates, student submissions (text, link, file), review with score and feedback, private file access |
| `coding` | routes, controller, service, validators | Coding problems (hidden tests never returned), run and submit through Judge0, evidence on pass |
| `sql-lab` | routes, controller, service, validators | SQL problems in their own schemas, sandboxed student queries, result comparison, evidence on pass |
| `assessments` | routes, controller, service, validators | MCQ and written assessments, timed attempts, marking (answer key or LLM rubric scoring), evidence on pass |
| `mock-interviews` | routes, service | Record mock interviews (four scores, overall mean), evidence for strong sub-scores, student and staff views; helpers used by eligibility, matching and risk |
| `skill-evidence` | service | `recordSkillEvidence` (the single way a skill becomes verified) and the skill passport |
| `skills` | routes, controller, service | Skill list; name normalisation and find-or-create (case- and spacing-insensitive, race-safe) |
| `learning` | routes, service | Learning library (shared and per college), progress tracking, improvement plan, video suggestions, AI tutor grounded on the library |
| `mentoring` | routes, service | Mentor list, assignment, at-risk queue, escalations with risk snapshot, mentee lists, mentor overview, notes with follow-ups, student overview |
| `analytics` | routes, controller, service, `insights.service.ts`, `risk.ts` | Overview and funnel counts; the placement-office insights (readiness, at-risk, branches, skills, packages, recruiter engagement, offers and documents); nudges; `risk.ts` is the pure at-risk scorer and readiness bands |
| `copilot` | routes, service | Builds the role-scoped facts snapshot and asks the AI service for a grounded answer |
| `ai` | routes | `POST /ai/jobs/analyze`: JD autofill proxy, rate-limited |
| `cv` | routes, service, `cv.schema.ts`, `cv.render.ts` | CV maker: prefill from profile, save, AI summary, PDF (pdfkit) and Word (docx) rendering, save as resume |
| `colleges` | routes, service | Public college search and states; staff requests and reviews; college staff list; admin verify, edit and merge |
| `notifications` | routes, service | `notify()` (in-app rows plus background email for selected types), list, unread count, mark read |
| `predictive` | routes, controller, service | Predictive likelihood for eligible candidates and model information (separate from matching) |

### backend/prisma

| File | What it does |
|---|---|
| `schema.prisma` | The data model: users and role profiles, colleges and staff, jobs and requirements, applications, interviews, drives, offers and documents, labs, assessments, evidence, mock interviews, learning, mentoring, assignments, notifications, CVs, analytics events |
| `migrations/` | Versioned SQL migrations applied with `prisma migrate deploy` |
| `seed.ts` | Base seed: the demo college, 18 skills, and three companies with one published job each (`npx prisma db seed`) |
| `data/indian-colleges.ts` | The curated directory of 227 institutions used by `setup-tenancy.ts` |
| `data/learning-resources.ts` | The curated free learning resources used by `seed-learning.ts` |

### backend/scripts

Run from `backend/` with `npx tsx scripts/<name>.ts`.

| Script | What it does | Changes data? |
|---|---|---|
| `setup-tenancy.ts [college]` | Loads the college directory as verified; attaches officers, drives and students without a college to the default college | Adds and updates, deletes nothing |
| `setup-sql-lab-role.ts` | Creates (or rotates the password of) the read-only `sql_lab_runner` role and prints `SQL_LAB_DATABASE_URL` | Database role |
| `seed-learning.ts` | Loads or refreshes the curated learning library | Adds and updates |
| `seed-demo.ts` | Deletes the previous demo season (`@demo.campuslink.dev` users, two demo companies, the Pune demo college) and loads a new one | **Deletes demo data, then adds** |
| `create-admin.ts <email> <password> "<name>"` | Creates an admin, or turns an existing user into one (overwrites role, password and name) | Yes |
| `merge-duplicate-skills.ts [--dry-run]` | Merges skills that differ only in case or spacing and repoints every reference | **Deletes duplicates** |
| `normalize-branches.ts` | Converts free-typed branches ("B.Tech CSE") to codes ("CSE") | Updates |
| `backfill-offer-documents.ts` | Adds the default document checklist to older offers | Adds |
| `move-resumes-private.ts` | Moves old public resumes into private storage and rewrites their paths | Moves files, removes unreferenced ones |
| `cleanup-test-fixtures.ts [--dry-run]` | Removes test accounts and records (`@test.com`, `@demo.test`, `@funnel.test` and related) | **Deletes** |
| `measure-latency.ts` | Logs in over HTTP and prints p50/p95 latency of the heavier endpoints | Read-only |

### backend/tests

Pure unit tests with no database (`npm test`, 48 tests).

| File | Covers |
|---|---|
| `eligibility.test.ts` | Every requirement type and the exact explanation sentences |
| `mock-interview.test.ts` | Mock-interview benchmark, overall score, latest score, risk factor |
| `ai-client-fallback.test.ts` | Node fallback match and readiness scores |
| `drive-conflicts.test.ts` | Venue, shared-student and plain clashes; slot suggestion; 500-schedule brute-force property test |
| `risk.test.ts` | Readiness formula parity and risk levels |
| `cv.test.ts` | CV schema, section order, PDF and Word rendering, video fallback |
| `skills.test.ts` | Skill-name keys and canonical spelling |

---

## frontend/

### Root

| File | What it does |
|---|---|
| `index.html` | Page shell; applies the saved or OS theme before first paint to avoid a flash |
| `vite.config.js` | Vite with the React plugin |
| `.env.example` | `VITE_API_URL` (default `http://localhost:5000/api/v1`) |
| `package.json` | React 19, React Router 7, lucide-react icons, Monaco editor, IBM Plex fonts; Vite 8 and oxlint |
| `public/logo-mark*.png` | Logo and favicon |
| `public/images/*.jpg` | Campus and student photos on the landing page (credited in its footer) |

### frontend/src

| File | What it does |
|---|---|
| `main.jsx` | Loads fonts and styles, renders `<App/>` inside the router |
| `App.jsx` | Theme, auth and toast providers, and every route grouped by role behind `ProtectedRoute` |
| `index.css` | Imports the style sheets in order |

### frontend/src/services, context, lib

| File | What it does |
|---|---|
| `services/api.js` | The only HTTP client: base URL, Bearer token from `localStorage["campuslink_token"]`, JSON and form uploads, `ApiError` with code and details, `downloadFile` for private files |
| `context/AuthContext.jsx` | Current user; restores the session with `GET /auth/me`; `login`, `register`, `refresh`, `logout` |
| `context/ThemeContext.jsx` | Light/dark theme following the OS until the user chooses (saved in `localStorage`) |
| `context/ToastContext.jsx` | Toast messages (success, error, info) |
| `lib/format.js` | Dates, relative time, salary in LPA, greetings, initials |
| `lib/status.js` | Labels and colours for every status (application, interview, offer, document, drive, readiness...) |
| `lib/branches.js` | Branch codes and labels |
| `lib/password.js` | Password rule, same as the backend |
| `lib/students.js` | `fetchAllStudents()`: loads every page of `GET /students` |

### frontend/src/components

| File | What it does |
|---|---|
| `layout/AppShell.jsx` | Workspace layout: sidebar (per role), notification bell, user card, theme toggle, log out, mobile menu |
| `layout/navigation.js` | Sidebar menus for the student, recruiter, placement office, admin and mentor workspaces |
| `layout/Notifications.jsx` | Notification bell: polls the unread count every 30 s, lists, marks read, opens the linked page |
| `common/ProtectedRoute.jsx` | Route guard: signed in, allowed role, staff approved (see [RBAC.md](RBAC.md#frontend-guards)); `ROLE_HOME` |
| `common/PendingApproval.jsx` | "Waiting for approval" / "Access not approved" screen for staff |
| `common/CollegePicker.jsx` | Searchable college directory with "add your college" |
| `common/Modal.jsx` | Dialog (bottom sheet on phones) |
| `common/MatchScore.jsx`, `common/ScoreBreakdown.jsx` | Match score badge and the weighted breakdown |
| `common/FunnelBars.jsx` | Hiring funnel with stage conversion |
| `common/ResumeButton.jsx` | Downloads a student's resume through the access-checked endpoint |
| `common/FormattedText.jsx` | Safe mini-markdown for Copilot, tutor and assignment text (no HTML injection) |
| `common/Logo.jsx`, `common/ThemeToggle.jsx`, `common/AnimatedNumber.jsx` | Logo, theme switch, counting-up numbers |
| `ui/index.jsx` | Design-system primitives: `PageHeader`, `Card`, `StatCard`, `EmptyState`, `Alert`, `Badge`, `StatusBadge`, `Avatar`, `PageSkeleton`, `Spinner` |
| `auth/AuthLayout.jsx` | Split layout for sign-in pages and the password field with show/hide |
| `landing/LandingVisuals.jsx` | Landing-page illustrations and workspace previews |
| `student/JobMatchCard.jsx` | A job match with score, skills, verdict and checklist |
| `student/EligibilityChecklist.jsx` | Requirement-by-requirement pass/fail list |
| `student/RoleReadiness.jsx` | Readiness-by-role card on the dashboard |
| `student/ProfileExtras.jsx` | Projects and certifications editors |
| `recruiter/JobForm.jsx` | Post-a-job form: audience, eligibility, mock benchmark, auto-shortlist rule, skills |
| `recruiter/JdAutofill.jsx` | Paste a JD and pre-fill the form |
| `recruiter/PredictiveLikelihoodPanel.jsx` | Experimental ML panel under the candidate ranking |
| `pipeline/pipelineConfig.js` | Kanban stages and allowed transitions (mirrors the backend) |
| `pipeline/PipelineCard.jsx` | Candidate card with stage actions and tags |
| `pipeline/ScheduleInterviewModal.jsx` | Schedule or reschedule, with clash handling and the suggested slot |
| `pipeline/MakeOfferModal.jsx` | Offer form (type, CTC, joining date, bond) |
| `offers/OfferDocuments.jsx` | Joining-document checklist: student upload, employer review and requests, downloads |
| `assignments/CandidateChecklist.jsx` | Pick the applicants who receive an assignment |
| `mentoring/EscalationList.jsx` | Escalations with filters, start and resolve; risk badge |
| `mock-interviews/MockInterviewModal.jsx` | Record a mock interview (four sliders, skill, focus, feedback) |
| `mock-interviews/MockInterviewScores.jsx` | Four score bars and the score colour |
| `learning/ResourceItem.jsx` | A library item with progress tracking and remove |
| `learning/SkillLearnPanel.jsx`, `learning/SkillVideos.jsx` | Per-skill material, videos and tutor shortcut |
| `labs/TestCaseList.jsx` | Coding-lab test results |
| `cv/CvPreview.jsx` | Live CV preview (mirrors the PDF layout) |
| `staff/StaffRequests.jsx` | Pending, approved and rejected staff requests with approve/decline |

### frontend/src/pages

| Page | Route | What it does |
|---|---|---|
| `LandingPage.jsx` | `/` | Product overview |
| `auth/Login.jsx`, `SignUp.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx` | `/login`, `/signup`, ... | Sign-in, sign-up with role and college, password reset |
| `student/StudentDashboard.jsx` | `/student/dashboard` | Stats, offer banner, readiness by role, roles to apply to, interviews, latest mock interview, mentor, next steps |
| `student/StudentProfile.jsx` | `/student/profile` | Academics, skills, resume upload, projects, certifications |
| `student/CvMaker.jsx` | `/student/cv` | CV editor, AI summary, PDF/Word download, use as resume |
| `student/JobRecommendations.jsx` | `/student/jobs` | Eligible and not-eligible roles with verdicts; apply |
| `student/StudentApplications.jsx` | `/student/applications` | Applications and statuses |
| `student/StudentAssignments.jsx` | `/student/assignments` | Company assignments: submit, see score and feedback |
| `student/StudentInterviews.jsx` | `/student/interviews` | Upcoming and past interviews |
| `student/StudentOffers.jsx` | `/student/offers` | Accept, decline or defer; joining documents |
| `student/StudentMockInterviews.jsx` | `/student/mock-interviews` | Mock-interview history, scores and feedback |
| `student/StudentSkillGap.jsx` | `/student/skill-gap` | Skill gap for any role with learning material |
| `student/LearningPage.jsx` | `/student/learning` | Improvement plan, library, my list |
| `student/TutorPage.jsx` | `/student/tutor` | AI tutor chat |
| `student/CodeLabList.jsx`, `CodeLabProblem.jsx` | `/student/code-lab[/:id]` | Coding problems and the Monaco editor |
| `student/SqlLabList.jsx`, `SqlLabProblem.jsx` | `/student/sql-lab[/:id]` | SQL problems and the query runner |
| `student/AssessmentList.jsx`, `AssessmentAttempt.jsx` | `/student/assessments[/:id]` | Assessment list; timed MCQ or written attempt with results and feedback |
| `student/SkillPassport.jsx` | `/student/skill-passport` | Skills with verified evidence |
| `recruiter/RecruiterDashboard.jsx` | `/recruiter/dashboard` | Company stats, roles table, funnel, post a job |
| `recruiter/JobCandidates.jsx` | `/recruiter/jobs/:id/candidates` | Auto-shortlist rule, screening summary, ranked candidates, predictive panel |
| `recruiter/RecruiterAssignments.jsx`, `AssignmentDetail.jsx` | `/recruiter/assignments[/:id]` | Create assignments, review submissions |
| `placement/PlacementDashboard.jsx` | `/placement/dashboard` | Placement overview and at-risk nudges (officers and admins) |
| `placement/PlacementDrives.jsx` | `/placement/drives` | Drives with live clash check |
| `placement/PlacementStudents.jsx` | `/placement/students`, `/mentor/students` | Student directory |
| `placement/PlacementCompanies.jsx` | `/placement/companies` | Company directory |
| `placement/PlacementTeam.jsx` | `/placement/team` | Approve officers and mentors; the team |
| `placement/PlacementMentoring.jsx` | `/placement/mentoring` | At-risk queue, assign mentors, escalate, mentored students, mentors |
| `mentor/MentorDashboard.jsx` | `/mentor/dashboard` | Mentee figures, escalations, follow-ups |
| `mentor/MentorMentees.jsx` | `/mentor/mentees` | Mentee table (also used by the office) |
| `mentor/MentorEscalations.jsx` | `/mentor/escalations` | Escalations to handle |
| `mentor/MenteeDetail.jsx` | `/mentor/mentees/:id`, `/placement/mentoring/students/:id` | Student page: notes, applications, mock interviews, escalations, skills, learning, offers |
| `admin/AdminApprovals.jsx` | `/admin/approvals` | Staff approvals across colleges |
| `admin/AdminColleges.jsx` | `/admin/colleges` | Verify, edit or merge user-added colleges |
| `shared/ApplicationsPipeline.jsx` | `/recruiter/pipeline`, `/placement/pipeline` | Drag-and-drop pipeline |
| `shared/InterviewsManager.jsx` | `/recruiter/interviews`, `/placement/interviews` | Interview agenda, outcomes, reschedule, cancel |
| `shared/OffersManager.jsx` | `/recruiter/offers`, `/placement/offers` | Offers, withdrawals, conversions, joining, documents |
| `shared/CopilotPage.jsx` | `/recruiter/copilot`, `/placement/copilot` | Ask Copilot with "show data used" |
| `shared/LearningLibrary.jsx` | `/placement/learning`, `/mentor/learning`, `/admin/learning` | Browse, add and remove library material |
| `shared/MockInterviewsManager.jsx` | `/placement/mock-interviews`, `/mentor/mock-interviews` | Record and review mock interviews |

### frontend/src/styles

| File | What it does |
|---|---|
| `tokens.css` | Colours, spacing, radii and shadows for light and dark themes |
| `base.css` | Reset, typography, form controls |
| `components.css` | Buttons, cards, badges, tables, modals, toolbars |
| `layout.css` | App shell and sidebar |
| `landing.css`, `auth.css` | Landing and sign-in pages |
| `features.css` | Feature screens (matches, pipeline, candidates, offers, mock interviews, written assessments...) |
| `modules.css` | Learning, CV maker, assignments, mentoring |

---

## ai-service/

Stateless FastAPI service called only by the backend. It has **no authentication of its own** and must run on a private network (see [RBAC.md](RBAC.md#known-gaps-and-inconsistencies)).

### ai-service root

| File | What it does |
|---|---|
| `requirements.txt` | FastAPI, uvicorn, pydantic, httpx, python-dotenv, pytest |
| `requirements-train.txt` | Adds scikit-learn, only for retraining the predictive model offline |
| `.env.example` | `PORT`, `GROQ_API_KEY` (empty = rule-based only), `GROQ_MODEL` |

### ai-service/app

| File | Route | What it does |
|---|---|---|
| `main.py` | `GET /health` | Creates the app and mounts every router |
| `api/matching.py` | `POST /ai/match` | Match score, breakdown, matched and missing skills, explanation (no LLM) |
| `api/readiness.py` | `POST /ai/readiness` | Readiness score and band (no LLM) |
| `api/skills.py` | `POST /ai/skill-gap` | Matched vs missing skills with aliases (no LLM) |
| `api/resume.py` | `POST /ai/resume/analyze` | Skills, projects, education, experience, certifications from resume text (no LLM) |
| `api/jd.py` | `POST /ai/jd/analyze` | JD analysis: rules first, then the LLM, grounded against the text |
| `api/copilot.py` | `POST /ai/copilot` | Grounded Q&A over the facts snapshot, with number verification |
| `api/cv.py` | `POST /ai/cv/summary` | CV summary by LLM (20–600 characters) or template |
| `api/tutor.py` | `POST /ai/tutor` | AI tutor; keeps only resource IDs it was given |
| `api/written.py` | `POST /ai/assess/written` | Written-answer scoring on four criteria by LLM, or the provisional rule-based fallback |
| `api/predictive.py` | `POST /ml/placement-likelihood`, `GET /ml/model-info` | The separate predictive model |
| `logic/scoring.py` | | The weighted match formula (40/20/10/10/10/10) |
| `logic/readiness.py` | | Readiness average and bands |
| `logic/extraction.py` | | Regex extractors: degree, CGPA, role, branches, sections, mandatory vs optional skills |
| `logic/jd_llm.py` | | LLM JD analysis with grounding rules |
| `logic/copilot.py` | | Copilot prompt and `find_unverified_numbers` |
| `llm/groq_client.py` | | Groq client that never raises: timeout, one retry on 429, fallback model |
| `skills/dictionary.py` | | About 125 canonical skills with aliases; skill extraction from text |
| `ml/features.py` | | The 7 model features (six match sub-scores + verified ratio) |
| `ml/simulation.py` | | Simulated placement seasons for training and evaluation |
| `ml/train.py` | | Offline training and evaluation; writes `model.json` |
| `ml/serve.py` | | Loads `model.json` and predicts without scikit-learn |
| `ml/model.json` | | The trained model: coefficients, scaler, metrics |

### ai-service/eval and tests

| File | What it does |
|---|---|
| `eval/evaluate.py` | Offline evaluation of the matching engine: ranking accuracy against baselines, readiness calibration, JD-parser accuracy, throughput (`python -m eval.evaluate`) |
| `eval/results.json` | The latest evaluation results |
| `tests/conftest.py` | Blanks `GROQ_API_KEY` so tests never call the real LLM; test client |
| `tests/test_*.py` | 68 tests: health, resume, JD, matching, readiness, skill gap, dictionary, LLM features (mocked), CV and tutor, written scoring, predictive model |

---

## docs/

| File | What it covers |
|---|---|
| `ARCHITECTURE.md` | Components, lifecycle, data model, security, deployment, multi-campus scaling |
| `ALGORITHMS.md` | Eligibility, match score, predictive model, readiness, parsing, scheduling, risk, mock interviews, written scoring, Copilot |
| `EVALUATION.md` | Evaluation method and results, test coverage, performance |
| `FEATURES.md` | Every feature and how it works |
| `FILES.md` | This guide |
| `RBAC.md` | Roles, scoping, permission matrix, per-feature access flows, known gaps |
