import { useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, Plus, Search, X } from "lucide-react";
import { api } from "../../services/api";
import { Spinner } from "../ui";

// Searchable college combobox. `value` is the selected college object.
// `onAddNew(query)` is offered when the college isn't in the directory.
function CollegePicker({ id, value, onChange, onAddNew, invalid, placeholder = "Search by college name or city" }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/colleges?q=${encodeURIComponent(query.trim())}&limit=12`);
        if (!cancelled) {
          setResults(res.data ?? []);
          setActive(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (college) => {
    onChange(college);
    setQuery("");
    setOpen(false);
  };

  const showAdd = Boolean(onAddNew) && query.trim().length >= 3;
  const optionCount = results.length + (showAdd ? 1 : 0);

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(optionCount - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (active < results.length) choose(results[active]);
      else if (showAdd) {
        setOpen(false);
        onAddNew(query.trim());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (value) {
    return (
      <div className="college-chosen">
        <div>
          <strong>
            {value.name}
            {value.verified && <BadgeCheck className="icon-brand" aria-label="Verified college" />}
          </strong>
          <span>{[value.city, value.state].filter(Boolean).join(", ") || "Location not set"}</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)} aria-label="Change college">
          <X />
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="college-picker" ref={rootRef}>
      <div className="search-input college-picker-input">
        <Search aria-hidden="true" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && optionCount ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          className={invalid ? "input-error" : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {loading && open && <Spinner />}
      </div>

      {open && (
        <ul className="college-options" id={listId} role="listbox">
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(c);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <strong>
                {c.name}
                {c.verified && <BadgeCheck className="icon-brand" aria-label="Verified" />}
              </strong>
              <span>
                {[c.city, c.state].filter(Boolean).join(", ")}
                {c.category ? ` · ${c.category}` : ""}
              </span>
            </li>
          ))}
          {!loading && results.length === 0 && (
            <li className="college-empty" role="presentation">
              {query.trim().length < 3 ? "Type at least 3 letters to search" : "No college found with that name"}
            </li>
          )}
          {showAdd && (
            <li
              id={`${listId}-${results.length}`}
              role="option"
              aria-selected={active === results.length}
              className={`college-add ${active === results.length ? "is-active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                onAddNew(query.trim());
              }}
              onMouseEnter={() => setActive(results.length)}
            >
              <Plus aria-hidden="true" />
              Can't find it? Add “{query.trim()}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default CollegePicker;
