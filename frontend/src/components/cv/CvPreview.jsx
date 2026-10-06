// HTML twin of the PDF/Word renderers (backend cv.render.ts): same sections,
// same order, same skip-if-empty rules, so the preview matches the download.

function range(start, end) {
  if (start && end) return `${start} – ${end}`;
  return start || end || "";
}

const join = (parts, sep = " · ") => parts.map((p) => p?.trim?.() ?? p).filter(Boolean).join(sep);

function Entry({ title, right, subtitle, link, bullets }) {
  return (
    <div className="cvp-entry">
      <div className="cvp-entry-head">
        <strong>{title}</strong>
        {right && <span>{right}</span>}
      </div>
      {subtitle && <div className="cvp-sub">{subtitle}</div>}
      {link && <div className="cvp-link">{link.replace(/^https?:\/\//, "")}</div>}
      {bullets?.filter(Boolean).length > 0 && (
        <ul>
          {bullets.filter(Boolean).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="cvp-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function CvPreview({ data, template }) {
  const h = data.header;
  const contact = join([h.email, h.phone, h.location, ...h.links.map((l) => l.url.replace(/^https?:\/\//, ""))], "  |  ");
  const education = data.education.filter((e) => e.institution || e.degree);
  const experience = data.experience.filter((e) => e.role || e.organization);
  const projects = data.projects.filter((p) => p.title);
  const certifications = data.certifications.filter((c) => c.name);
  const achievements = data.achievements.filter(Boolean);

  return (
    <article className={`cvp cvp-${template}`} aria-label="CV preview">
      <header className="cvp-header">
        <h2>{h.fullName || "Your name"}</h2>
        {h.headline && <p className="cvp-headline">{h.headline}</p>}
        {contact && <p className="cvp-contact">{contact}</p>}
      </header>

      {data.summary.trim() && (
        <Section title="Summary">
          <p>{data.summary}</p>
        </Section>
      )}
      {education.length > 0 && (
        <Section title="Education">
          {education.map((e, i) => (
            <Entry key={i} title={e.institution} right={range(e.start, e.end)} subtitle={join([join([e.degree, e.field], ", "), e.score])} />
          ))}
        </Section>
      )}
      {data.skills.length > 0 && (
        <Section title="Skills">
          <p>{data.skills.join(", ")}</p>
        </Section>
      )}
      {experience.length > 0 && (
        <Section title="Experience">
          {experience.map((e, i) => (
            <Entry key={i} title={join([e.role, e.organization], ", ")} right={range(e.start, e.end)} subtitle={e.location} bullets={e.bullets} />
          ))}
        </Section>
      )}
      {projects.length > 0 && (
        <Section title="Projects">
          {projects.map((p, i) => (
            <Entry key={i} title={p.title} subtitle={p.tech.filter(Boolean).join(", ")} link={p.url} bullets={p.bullets} />
          ))}
        </Section>
      )}
      {certifications.length > 0 && (
        <Section title="Certifications">
          {certifications.map((c, i) => (
            <Entry key={i} title={join([c.name, c.issuer], ", ")} right={c.year} />
          ))}
        </Section>
      )}
      {achievements.length > 0 && (
        <Section title="Achievements">
          <ul>
            {achievements.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

export default CvPreview;
