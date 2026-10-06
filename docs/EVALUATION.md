# Evaluation

Five things were measured: how well the match score ranks candidates who go on to be hired, whether readiness bands mean something, how a separately trained predictive model compares to that match score on the same held-out data, how accurately job descriptions are parsed, and how fast the system responds. Correctness of the rule-based parts is covered by automated tests.

To reproduce:

```powershell
cd ai-service
python -m eval.evaluate                           # ranking, readiness, JD parsing, scorer throughput → eval/results.json
pip install -r requirements-train.txt
python -m app.ml.train                             # trains + evaluates the separate predictive model → app/ml/model.json
cd ../backend
npm test                           # 41 unit and property tests
npx tsx scripts/measure-latency.ts <student-email> <student-password>   # live API latency
```

## 1. Matching and readiness on simulated placement data

There is no public dataset that pairs student skill profiles with recruiter decisions, so the study uses a simulation designed so the scorer cannot "see the answer":

- **Students.** 1,000 per run, each with a hidden true level (0–5) for 3–8 of 20 skills, a branch, CGPA (correlated with ability) and occasional backlogs.
- **What the platform sees.** Self-declared levels, which are the true level plus noise (σ 0.9) and an optimism bias (+0.4). About 35% of skills are "verified" and much closer to the truth (σ 0.3), mirroring lab and assessment evidence. Some students list projects built from their strongest skills.
- **Roles.** 12 roles with realistic skill sets, CGPA cut-offs and branch lists.
- **Ground truth.** A student is hired if they pass the hard rules and their true fit for the role's skills, plus interview-day noise (σ 0.08), clears a bar. This hidden process uses true levels, which the scorer never receives.
- **Scale.** 5 independent runs (different random seeds): 8,786 eligible student–role pairs and 570 hires (base rate 6.5%).

Each role's eligible candidates were ranked by the production scorer (`compute_match`) and by three baselines.

| Ranking method | ROC AUC | Precision@10 | NDCG@10 |
|---|---|---|---|
| **CampusLink match score** | **0.929** (sd 0.009) | **0.437** (sd 0.041) | **0.703** (sd 0.052) |
| Share of required skills listed | 0.835 (sd 0.009) | 0.287 (sd 0.051) | 0.470 (sd 0.049) |
| CGPA only | 0.678 (sd 0.037) | 0.163 (sd 0.024) | 0.243 (sd 0.041) |
| Random | 0.499 (sd 0.016) | 0.077 (sd 0.015) | 0.105 (sd 0.015) |

How to read this:

- **AUC 0.93** means that for a random pair of one eventual hire and one non-hire in the same pool, the hire is ranked higher 93% of the time.
- **Precision@10 of 0.44** means a recruiter who interviews the top 10 meets about 4.4 eventual hires. Checking only whether skills are listed gives 2.9, ranking by CGPA 1.6, and random order 0.8.
- **The gain over "skills listed" comes from using levels.** Proficiency, partial credit below the required level, and the fact that verified evidence is more reliable all contribute.
- **Random scores 0.50,** as it should, which confirms the metrics are computed correctly.

### Do readiness bands mean anything?

Across all 8,786 pairs, the observed hire rate by readiness band was:

| Readiness band | Pairs | Observed hire rate |
|---|---|---|
| Not Ready (0–39) | 4,976 | 0.1% |
| Developing (40–59) | 3,084 | 3.9% |
| Ready (60–79) | 576 | 53.0% |
| Highly Employable (80–100) | 150 | 92.7% |

The bands are strictly ordered and separate well. A "Ready" student was about 14× more likely to be hired than a "Developing" one, which supports using 60 as the placement-ready threshold.

## 1a. Predictive model vs. the hand-set formula (held-out seasons)

The predictive model (`docs/ALGORITHMS.md` §2a) is a separate system from the matching engine above, so it's evaluated separately, on data neither scorer was tuned against: 6 simulated seasons (12,945 eligible pairs) for training, 2 different, never-trained-on seasons (4,141 pairs) held out for the numbers below.

| Scorer | ROC AUC | Precision@10 |
|---|---|---|
| **Trained model** | **0.951** | **1.00** |
| Existing hand-set formula, identical test data | 0.941 | 0.70 |

The trained model edges out the hand-set formula on this simulated data — expected, since it can learn a distinction (verified skills are more trustworthy than declared ones) the fixed-weight formula has no way to express. The gap is modest, which is also expected: both scorers are fed the same six sub-scores, and the formula's hand-set weights were themselves chosen to track exactly the kind of signal this simulation rewards.

**What this evaluation is, and isn't.** It's a legitimate comparison of two scorers on identical held-out data with a hidden ground truth neither one sees during training. It is **not** a validation against real placement outcomes — none exist yet (deliverable #10 explicitly permits simulated data for exactly this reason). Before relying on this model for a real decision, it should be retrained on at least one real placement season once that data exists; `python -m app.ml.train` is written so pointing it at a real dataset instead of `app.ml.simulation` is the only change required.

## 2. Job description parsing

Eight job descriptions with hand-labelled skill lists (including aliases such as "MERN", "scikit-learn", "NLP") were parsed by the rule-based path. The LLM path is not exercised offline, so these numbers are a floor.

| Metric | Value |
|---|---|
| Precision | 0.947 |
| Recall | 1.000 |
| F1 | 0.973 |

Both disagreements were extra skills inferred from the job title: "Machine Learning" from "ML Engineer" and "Android Development" from "Android developer". Both are defensible, but they weren't in the labels.

## 3. Correctness of the rule-based parts (automated tests)

| Area | Tests | What is checked |
|---|---|---|
| Eligibility engine | 12 | Every requirement type, preferred vs mandatory skills, and the exact explanation sentences shown to students |
| AI fallback scorers | 9 | Offline match and readiness scores use the same formulas as the AI service |
| Drive scheduling | 7 | Venue clash blocks, shared students warn, back-to-back is not a clash, next-slot search, and a property test on 500 random schedules comparing the detector to a minute-by-minute brute-force check, confirming every suggested slot is genuinely free (100% agreement) |
| Unplaced-risk scoring | 5 | Readiness formula parity, risk levels, reason ordering, and no penalty when no roles are open |
| Mock interviews | 7 | Benchmark pass, fail and missing score, preferred never blocks, overall-score rounding, latest score used, risk factor only for a low (not a missing) score, and the exact combined explanation sentence |
| Written-answer scoring (AI service) | 6 | LLM scores scaled to points and clamped, empty answers score zero, incomplete LLM output falls back, the fallback is provisional and capped, a real answer outranks a non-answer, and injected instructions in an answer are passed as data |
| AI service | 48 | Scoring, readiness, skill gap, resume and JD parsing, LLM grounding (hallucinated skills dropped, out-of-range numbers rejected), Copilot number verification, rate-limit fallback |

End-to-end API checks were also run against the live database:

- **Offer lifecycle (29 checks):** defer, document upload, verify and reject with permissions, private download, internship-to-PPO conversion, withdrawal, reminders de-duplicated.
- **Drive scheduling:** a venue clash returns 409 with a suggested slot, and creating at that slot succeeds.
- **Resume parsing:** skills, a project and a certification extracted from a PDF.
- **Resume access control:** own, officer, applicant-recruiter, forbidden, anonymous and old public path.

These checks caught and fixed two real bugs: an internship could be converted before it was accepted, and funnel stages could exceed the previous stage.

## 4. Performance

### Scorer throughput

The production match scorer computes **~52,000 match scores per second** on one CPU core. Ranking a 5,000-student campus against 50 roles is about 5 seconds of CPU in total, so scoring is not the bottleneck.

### API latency

Measured on the development setup: API and AI service on a laptop, database on Neon in `us-east-2`. 10 requests each.

| Endpoint | p50 ms | p95 ms |
|---|---|---|
| Student job matches, all roles, with AI scoring | 2,372 | 4,814 |
| Student readiness by role | 2,669 | 3,877 |
| Ranked candidates for a job | 2,077 | 3,542 |
| Placement insights (cached) | 3 | 5,910 |
| Placement insights (fresh) | 2,313 | 4,137 |
| Drive clash check | 880 | 1,748 |

The drive clash check makes three simple queries and takes 880 ms, so each database round trip costs roughly **300 ms** from this machine. Latency is dominated by network distance to the database, not by computation. Running the API in the database's region is expected to bring these endpoints to well under 200 ms (see [ARCHITECTURE.md](ARCHITECTURE.md#deployment)). Insights are cached for 30 seconds, so repeat dashboard loads return in a few milliseconds.

## Limitations

- **The ranking study is a simulation.** It shows the scorer uses the signals it's given sensibly and is robust to noisy self-reports. It does not prove real-world hiring accuracy, which needs a season of real outcomes.
- **The matching engine's weights are hand-set** (40/20/10/10/10/10), as are the risk points. A separate, additive predictive model (§1a) now demonstrates the fitted-weights alternative — logistic regression on the same factors → hired — but it's trained on simulated seasons; it needs a real season of outcomes before it should inform a real decision, and the matching engine itself is unchanged.
- **The eligibility rule in the study is relaxed** to "at least half the required skills listed" so candidate pools aren't tiny. The strict production rule is covered by unit tests.
- **The JD test set is small** (8 descriptions). It demonstrates behaviour, not a benchmark.
