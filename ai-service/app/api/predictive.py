"""Predictive placement-likelihood model -- a SEPARATE system from matching.

Mounted at /ml, distinct from /ai/match. This route, its request/response
models and the model it serves have no coupling to app/api/matching.py or
app/logic/scoring.py's engine: the existing rule + LLM hybrid matching engine
is completely unaffected by anything in this file.
"""
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.ml import serve

router = APIRouter(prefix="/ml", tags=["predictive"])


class PredictiveSkillIn(BaseModel):
    name: str
    proficiency: Optional[float] = 0
    verified: Optional[bool] = False


class PredictiveProjectIn(BaseModel):
    title: Optional[str] = None
    technologies: List[str] = Field(default_factory=list)


class PredictiveCertificationIn(BaseModel):
    name: Optional[str] = None
    verified: Optional[bool] = False


class PredictiveStudentIn(BaseModel):
    cgpa: Optional[float] = None
    skills: List[PredictiveSkillIn] = Field(default_factory=list)
    projects: List[PredictiveProjectIn] = Field(default_factory=list)
    certifications: List[PredictiveCertificationIn] = Field(default_factory=list)
    experienceMonths: Optional[float] = 0


class PredictiveRequirementIn(BaseModel):
    type: str
    skillName: Optional[str] = None
    minimumProficiency: Optional[float] = None
    value: Optional[float] = None


class PredictiveJobIn(BaseModel):
    requirements: List[PredictiveRequirementIn] = Field(default_factory=list)


class PlacementLikelihoodRequest(BaseModel):
    student: PredictiveStudentIn
    job: PredictiveJobIn


class PlacementLikelihoodResponse(BaseModel):
    available: bool
    probability: Optional[float] = None


class ModelInfoResponse(BaseModel):
    available: bool
    featureImportance: Optional[list] = None
    trainedOn: Optional[dict] = None
    evaluatedOn: Optional[dict] = None
    metrics: Optional[dict] = None
    notes: Optional[str] = None


@router.post("/placement-likelihood", response_model=PlacementLikelihoodResponse)
def placement_likelihood(payload: PlacementLikelihoodRequest) -> PlacementLikelihoodResponse:
    probability = serve.predict_probability(
        payload.student.model_dump(),
        payload.job.model_dump(),
    )
    return PlacementLikelihoodResponse(available=probability is not None, probability=probability)


@router.get("/model-info", response_model=ModelInfoResponse)
def model_info() -> ModelInfoResponse:
    info = serve.model_info()
    if info is None:
        return ModelInfoResponse(available=False)
    return ModelInfoResponse(available=True, **info)
