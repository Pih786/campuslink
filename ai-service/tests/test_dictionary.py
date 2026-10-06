"""Direct tests of the skill dictionary's matching/boundary behavior.

These target the tricky cases called out in the spec: short aliases like
"js"/"ml"/"py" must not match inside unrelated words, but should match as
standalone tokens, and overlapping matches (e.g. "js" inside "Node.js")
should collapse to the more specific skill rather than double-counting.
"""
from app.skills.dictionary import extract_skills, resolve_skill_name


def test_short_alias_does_not_match_inside_longer_word():
    # "js" must not match inside "jscript"; "py" must not match inside "python".
    skills = extract_skills("I used JScript once and love Python and Pythonic code.")
    assert "JavaScript" not in skills
    assert "Python" in skills


def test_short_alias_matches_as_standalone_token():
    skills = extract_skills("Skills: JS, ML, Py, k8s")
    assert "JavaScript" in skills
    assert "Machine Learning" in skills
    assert "Python" in skills
    assert "Kubernetes" in skills


def test_overlapping_alias_prefers_more_specific_skill():
    # "Node.js" should be recognized as Node.js, not additionally spawn a
    # spurious standalone "JavaScript" match from the ".js" substring.
    skills = extract_skills("Backend built with Node.js and Express.js")
    assert "Node.js" in skills
    assert "Express.js" in skills
    assert skills.count("JavaScript") == 0


def test_symbol_aliases_match_correctly():
    skills = extract_skills("Experience with C++, C#, .NET, ASP.NET and CI/CD pipelines")
    assert set(["C++", "C#", ".NET", "ASP.NET", "CI/CD"]).issubset(set(skills))
    # Bare "C" should not spuriously also appear from within "C++"/"C#".
    assert "C" not in skills


def test_extract_skills_dedupes_and_preserves_first_appearance_order():
    skills = extract_skills("React is great. I also used react.js and ReactJS everywhere.")
    assert skills == ["React"]


def test_extract_skills_empty_input():
    assert extract_skills("") == []
    assert extract_skills(None) == []


def test_resolve_skill_name_aliases():
    assert resolve_skill_name("reactjs") == "React"
    assert resolve_skill_name("ReactJS") == "React"
    assert resolve_skill_name("React") == "React"
    assert resolve_skill_name("postgres") == "PostgreSQL"
    assert resolve_skill_name("psql") == "PostgreSQL"
    assert resolve_skill_name("k8s") == "Kubernetes"
    assert resolve_skill_name("aws") == "AWS"
    assert resolve_skill_name("ml") == "Machine Learning"
    assert resolve_skill_name("py") == "Python"


def test_resolve_skill_name_unknown_is_passthrough():
    assert resolve_skill_name("Photoshop") == "Photoshop"
    assert resolve_skill_name("  Blender  ") == "Blender"
