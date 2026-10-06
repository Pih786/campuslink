import { PageHeader } from "../../components/ui";
import EscalationList from "../../components/mentoring/EscalationList";

function MentorEscalations() {
  return (
    <div className="page">
      <PageHeader
        title="Escalations"
        subtitle="Students the placement office has asked you to support. Resolve each one with a short note on what changed."
      />
      <EscalationList studentLink={(id) => `/mentor/mentees/${id}`} />
    </div>
  );
}

export default MentorEscalations;
