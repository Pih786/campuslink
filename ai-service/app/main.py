from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from app.api import copilot, cv, jd, matching, predictive, readiness, resume, skills, tutor, written  # noqa: E402

app = FastAPI(
    title="CampusLink AI Service",
    description="Resume/JD analysis, matching, and the grounded Placement Copilot for CampusLink.",
    version="0.2.0",
)

# This service is only ever called server-to-server by the Node backend (the
# actual trust boundary), so CORS isn't strictly required -- but a permissive
# policy costs nothing and is handy if someone hits it directly in dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume.router)
app.include_router(jd.router)
app.include_router(matching.router)
app.include_router(skills.router)
app.include_router(readiness.router)
app.include_router(copilot.router)
app.include_router(cv.router)
app.include_router(tutor.router)
app.include_router(predictive.router)
app.include_router(written.router)


@app.get("/health")
def health():
    return {"status": "ok"}
