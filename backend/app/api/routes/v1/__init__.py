"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.routes.v1 import (
    agent,
    auth,
    conversations,
    eval_candidates,
    feedback,
    files,
    health,
    insights,
    llm_config,
    rag,
    rag_settings,
    usage,
    users,
)

v1_router = APIRouter()

v1_router.include_router(health.router, tags=["health"])
v1_router.include_router(auth.router, prefix="/auth", tags=["auth"])
v1_router.include_router(users.router, prefix="/users", tags=["users"])
v1_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
v1_router.include_router(feedback.router, tags=["feedback"])
v1_router.include_router(agent.router, tags=["agent"])
v1_router.include_router(rag.router, prefix="/rag", tags=["rag"])
v1_router.include_router(files.router, tags=["files"])
v1_router.include_router(llm_config.router, tags=["llm-config"])
v1_router.include_router(usage.router, tags=["usage"])
v1_router.include_router(insights.router, tags=["insights"])
v1_router.include_router(eval_candidates.router, tags=["eval"])
v1_router.include_router(rag_settings.router, tags=["settings"])
