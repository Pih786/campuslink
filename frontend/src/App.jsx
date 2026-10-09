import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import ProtectedRoute from "./components/common/ProtectedRoute";
import AppShell from "./components/layout/AppShell";
import { ADMIN_NAV, MENTOR_NAV, PLACEMENT_NAV, RECRUITER_NAV, STUDENT_NAV } from "./components/layout/navigation";

import LandingPage from "./pages/LandingPage";
import SignUp from "./pages/auth/SignUp";
import Login from "./pages/auth/Login";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";

import AdminApprovals from "./pages/admin/AdminApprovals";
import AdminColleges from "./pages/admin/AdminColleges";

import StudentDashboard from "./pages/student/StudentDashboard";
import StudentProfile from "./pages/student/StudentProfile";
import StudentSkillGap from "./pages/student/StudentSkillGap";
import JobRecommendations from "./pages/student/JobRecommendations";
import StudentApplications from "./pages/student/StudentApplications";
import StudentInterviews from "./pages/student/StudentInterviews";
import CodeLabList from "./pages/student/CodeLabList";
import CodeLabProblem from "./pages/student/CodeLabProblem";
import SqlLabList from "./pages/student/SqlLabList";
import SqlLabProblem from "./pages/student/SqlLabProblem";
import AssessmentList from "./pages/student/AssessmentList";
import AssessmentAttempt from "./pages/student/AssessmentAttempt";
import SkillPassport from "./pages/student/SkillPassport";
import StudentOffers from "./pages/student/StudentOffers";
import CvMaker from "./pages/student/CvMaker";
import LearningPage from "./pages/student/LearningPage";
import TutorPage from "./pages/student/TutorPage";
import StudentAssignments from "./pages/student/StudentAssignments";
import StudentMockInterviews from "./pages/student/StudentMockInterviews";

import RecruiterDashboard from "./pages/recruiter/RecruiterDashboard";
import JobCandidates from "./pages/recruiter/JobCandidates";
import RecruiterAssignments from "./pages/recruiter/RecruiterAssignments";
import AssignmentDetail from "./pages/recruiter/AssignmentDetail";

import PlacementDashboard from "./pages/placement/PlacementDashboard";
import PlacementStudents from "./pages/placement/PlacementStudents";
import PlacementCompanies from "./pages/placement/PlacementCompanies";
import PlacementDrives from "./pages/placement/PlacementDrives";
import PlacementTeam from "./pages/placement/PlacementTeam";
import PlacementMentoring from "./pages/placement/PlacementMentoring";
import LabManagement from "./pages/placement/LabManagement";

import MentorDashboard from "./pages/mentor/MentorDashboard";
import MentorMentees from "./pages/mentor/MentorMentees";
import MentorEscalations from "./pages/mentor/MentorEscalations";
import MenteeDetail from "./pages/mentor/MenteeDetail";

import ApplicationsPipeline from "./pages/shared/ApplicationsPipeline";
import InterviewsManager from "./pages/shared/InterviewsManager";
import OffersManager from "./pages/shared/OffersManager";
import CopilotPage from "./pages/shared/CopilotPage";
import LearningLibrary from "./pages/shared/LearningLibrary";
import MockInterviewsManager from "./pages/shared/MockInterviewsManager";

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route element={<ProtectedRoute allowedRoles={["STUDENT"]} />}>
              <Route element={<AppShell nav={STUDENT_NAV} />}>
                <Route path="/student/dashboard" element={<StudentDashboard />} />
                <Route path="/student/profile" element={<StudentProfile />} />
                <Route path="/student/skill-gap" element={<StudentSkillGap />} />
                <Route path="/student/jobs" element={<JobRecommendations />} />
                <Route path="/student/applications" element={<StudentApplications />} />
                <Route path="/student/interviews" element={<StudentInterviews />} />
                <Route path="/student/code-lab" element={<CodeLabList />} />
                <Route path="/student/code-lab/:problemId" element={<CodeLabProblem />} />
                <Route path="/student/sql-lab" element={<SqlLabList />} />
                <Route path="/student/sql-lab/:problemId" element={<SqlLabProblem />} />
                <Route path="/student/assessments" element={<AssessmentList />} />
                <Route path="/student/assessments/:assessmentId" element={<AssessmentAttempt />} />
                <Route path="/student/skill-passport" element={<SkillPassport />} />
                <Route path="/student/offers" element={<StudentOffers />} />
                <Route path="/student/cv" element={<CvMaker />} />
                <Route path="/student/learning" element={<LearningPage />} />
                <Route path="/student/tutor" element={<TutorPage />} />
                <Route path="/student/assignments" element={<StudentAssignments />} />
                <Route path="/student/mock-interviews" element={<StudentMockInterviews />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute allowedRoles={["RECRUITER"]} />}>
              <Route element={<AppShell nav={RECRUITER_NAV} />}>
                <Route path="/recruiter/dashboard" element={<RecruiterDashboard />} />
                <Route path="/recruiter/jobs/:jobId/candidates" element={<JobCandidates />} />
                <Route path="/recruiter/pipeline" element={<ApplicationsPipeline />} />
                <Route path="/recruiter/assignments" element={<RecruiterAssignments />} />
                <Route path="/recruiter/assignments/:assignmentId" element={<AssignmentDetail />} />
                <Route path="/recruiter/interviews" element={<InterviewsManager />} />
                <Route path="/recruiter/offers" element={<OffersManager />} />
                <Route path="/recruiter/copilot" element={<CopilotPage />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute allowedRoles={["PLACEMENT_OFFICER", "ADMIN"]} />}>
              <Route element={<AppShell nav={PLACEMENT_NAV} navByRole={{ ADMIN: ADMIN_NAV }} />}>
                <Route path="/placement/dashboard" element={<PlacementDashboard />} />
                <Route path="/placement/pipeline" element={<ApplicationsPipeline />} />
                <Route path="/placement/drives" element={<PlacementDrives />} />
                <Route path="/placement/interviews" element={<InterviewsManager />} />
                <Route path="/placement/offers" element={<OffersManager />} />
                <Route path="/placement/students" element={<PlacementStudents />} />
                <Route path="/placement/companies" element={<PlacementCompanies />} />
                <Route path="/placement/copilot" element={<CopilotPage />} />
                <Route path="/placement/mock-interviews" element={<MockInterviewsManager />} />
                <Route path="/placement/lab-management" element={<LabManagement />} />
                <Route element={<ProtectedRoute allowedRoles={["PLACEMENT_OFFICER"]} />}>
                  <Route path="/placement/team" element={<PlacementTeam />} />
                  <Route path="/placement/mentoring" element={<PlacementMentoring />} />
                  <Route path="/placement/mentoring/students/:studentId" element={<MenteeDetail />} />
                  <Route path="/placement/learning" element={<LearningLibrary />} />
                </Route>
              </Route>
            </Route>

            <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
              <Route element={<AppShell nav={ADMIN_NAV} />}>
                <Route path="/admin/approvals" element={<AdminApprovals />} />
                <Route path="/admin/colleges" element={<AdminColleges />} />
                <Route path="/admin/learning" element={<LearningLibrary />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute allowedRoles={["MENTOR"]} />}>
              <Route element={<AppShell nav={MENTOR_NAV} />}>
                <Route path="/mentor/dashboard" element={<MentorDashboard />} />
                <Route path="/mentor/mentees" element={<MentorMentees />} />
                <Route path="/mentor/mentees/:studentId" element={<MenteeDetail />} />
                <Route path="/mentor/escalations" element={<MentorEscalations />} />
                <Route path="/mentor/students" element={<PlacementStudents />} />
                <Route path="/mentor/learning" element={<LearningLibrary />} />
                <Route path="/mentor/mock-interviews" element={<MockInterviewsManager />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
