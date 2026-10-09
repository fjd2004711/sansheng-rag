"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.routes.v1 import (
    agent,
    auth,
    conversations,
    feedback,
    files,
    health,
    llm_config,
    rag,
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
