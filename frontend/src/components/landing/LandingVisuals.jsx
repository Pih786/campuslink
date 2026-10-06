// Landing-page visuals: real campus photos (Unsplash License, credited in the
// page footer) with product fragments layered on top. The fragments are built
// from the app's own UI vocabulary (cards, badges, stage colours), so what a
// visitor sees here is what they'll see after signing up. Photos carry alt
// text; the fragments are decorative and hidden from assistive tech, with the
// copy beside each visual carrying the meaning.
import { AlertTriangle, BadgeCheck, BellRing, Check, CircleCheck, Clock, MapPin, Plus, Search, X } from "lucide-react";

export function HeroVisual() {
  return (
    <div className="lp-hero-visual">
      <figure className="lp-photo lp-photo-hero">
        <img
          src="/images/students-classroom.jpg"
          alt="Students working together in a college classroom"
          width="1280"
          height="854"
          fetchPriority="high"
        />
      </figure>

      <div className="lp-float lp-float-toast" aria-hidden="true">
        <span className="lp-float-icon">
          <BellRing />
        </span>
        <div>
          <strong>Interview scheduled</strong>
          <span>Technical round · Tue 10:30 · no clash</span>
        </div>
      </div>

      <div className="lp-float lp-float-chip" aria-hidden="true">
        <span className="lp-float-label">Readiness · Cloud Engineer</span>
        <div className="lp-readiness">
          <span className="lp-mono">72</span>
          <span className="lp-band-pill">Ready</span>
        </div>
        <div className="lp-meter">
          <i style={{ width: "72%" }} />
        </div>
      </div>

      <div className="lp-float lp-float-offer" aria-hidden="true">
        <CircleCheck />
        <span>
          Offer accepted · <b className="lp-mono">₹12.0 LPA</b>
        </span>
      </div>
    </div>
  );
}

const CHECKS = [
  { met: true, text: "CGPA 8.1 meets the 7.0 minimum" },
  { met: true, text: "Branch CSE is one of CSE, IT, ECE" },
  { met: true, text: "AWS at level 4 (required: level 3)" },
  { met: false, text: "Kubernetes is required but isn't on your profile" },
];

const BLOCKERS = [
  { reason: "Missing Kubernetes", count: 21 },
  { reason: "CGPA below 7.0", count: 14 },
  { reason: "Branch not eligible", count: 9 },
];

export function ExplainVisual() {
  return (
    <div className="lp-stack" aria-hidden="true">
      <div className="lp-mock">
        <div className="lp-mock-head">
          <div>
            <span className="lp-mock-kicker">Student view</span>
            <strong>Cloud Engineer · CloudNova</strong>
          </div>
          <span className="lp-tag lp-tag-warning">Not eligible yet</span>
        </div>
        <p className="lp-verdict">
          Your CGPA and branch meet the criteria, but the role requires <b>Kubernetes</b>, which isn't on your profile.
        </p>
        <ul className="lp-checks">
          {CHECKS.map((c) => (
            <li key={c.text} className={c.met ? "is-met" : "is-not"}>
              {c.met ? <Check /> : <X />}
              {c.text}
            </li>
          ))}
        </ul>
        <div className="lp-mock-foot">Learning plan · 3 resources and videos for Kubernetes</div>
      </div>

      <div className="lp-mock lp-mock-offset">
        <div className="lp-mock-head">
          <div>
            <span className="lp-mock-kicker">Recruiter view</span>
            <strong>Screening summary</strong>
          </div>
        </div>
        <div className="lp-screen-figures">
          <div>
            <b className="lp-mono">48</b>
            <span>checked</span>
          </div>
          <div>
            <b className="lp-mono">12</b>
            <span>eligible</span>
          </div>
          <div>
            <b className="lp-mono">36</b>
            <span>excluded</span>
          </div>
        </div>
        <ul className="lp-bars">
          {BLOCKERS.map((b) => (
            <li key={b.reason}>
              <span>{b.reason}</span>
              <i>
                <em style={{ width: `${(b.count / 36) * 100}%` }} />
              </i>
              <span className="lp-mono">{b.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ScheduleVisual() {
  return (
    <div className="lp-stack" aria-hidden="true">
      <div className="lp-mock">
        <div className="lp-mock-head">
          <div>
            <span className="lp-mock-kicker">New drive</span>
            <strong>Acme Systems · Backend Engineer</strong>
          </div>
        </div>
        <div className="lp-fields">
          <div>
            <span>Date</span>
            <b>Tue, 12 Nov</b>
          </div>
          <div>
            <span>
              <Clock /> Time
            </span>
            <b>10:00 – 13:00</b>
          </div>
          <div className="lp-fields-wide">
            <span>
              <MapPin /> Venue
            </span>
            <b>Main Auditorium · capacity 180</b>
          </div>
        </div>
        <ul className="lp-clashes">
          <li className="is-danger">
            <X />
            <span>
              <b>Venue booked.</b> Main Auditorium hosts CloudNova's drive 09:30 – 12:00.
            </span>
          </li>
          <li className="is-warning">
            <AlertTriangle />
            <span>
              <b>7 shared students</b> are in process for both drives.
            </span>
          </li>
        </ul>
        <div className="lp-slot">
          <CircleCheck />
          <span>
            Next clash-free slot: <b>Tue 13:00 – 16:00</b>
          </span>
          <span className="lp-slot-btn">Use this slot</span>
        </div>
      </div>
    </div>
  );
}

const COLLEGES = [
  { name: "IIT Bombay", place: "Mumbai, Maharashtra · IIT" },
  { name: "IIT Bhilai", place: "Bhilai, Chhattisgarh · IIT" },
  { name: "IIIT Bangalore", place: "Bengaluru, Karnataka · IIIT" },
];

export function CampusVisual() {
  return (
    <div className="lp-campus-visual">
      <figure className="lp-photo lp-photo-campus">
        <img
          src="/images/campus-upes.jpg"
          alt="Students outside the academic block of an Indian university campus"
          width="1400"
          height="826"
          loading="lazy"
        />
      </figure>
      <div className="lp-mock lp-college-search" aria-hidden="true">
        <span className="lp-mock-kicker">Sign up · choose your college</span>
        <div className="lp-search-field">
          <Search />
          <span>IIT B</span>
        </div>
        <ul className="lp-college-list">
          {COLLEGES.map((c, i) => (
            <li key={c.name} className={i === 0 ? "is-active" : ""}>
              <b>
                {c.name}
                <BadgeCheck />
              </b>
              <span>{c.place}</span>
            </li>
          ))}
          <li className="lp-college-add">
            <Plus />
            Can't find it? Add your college
          </li>
        </ul>
      </div>
    </div>
  );
}

// A miniature of a workspace's real sidebar, rendered from the app's own
// navigation config so it can never drift from what users actually get.
export function SidebarMock({ nav }) {
  return (
    <div className="lp-sidebar-mock" aria-hidden="true">
      <div className="lp-sidebar-portal">
        Workspace
        <strong>{nav.portal}</strong>
      </div>
      {nav.sections.map((section) => (
        <div key={section.label} className="lp-sidebar-section">
          <span className="lp-sidebar-label">{section.label}</span>
          {section.links.map(({ to, label, icon: Icon }, i) => (
            <span key={to} className={`lp-sidebar-link ${section === nav.sections[0] && i === 0 ? "is-active" : ""}`}>
              <Icon />
              {label}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
