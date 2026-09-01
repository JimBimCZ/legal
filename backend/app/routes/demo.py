from fastapi import APIRouter

from ..demo import DemoResponse, build_demo

# Deliberately not behind get_current_user - this is the one public document
# surface, and it is why /api/documents/* does not have to be opened up.
router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("", response_model=DemoResponse)
def get_demo() -> DemoResponse:
    return build_demo()
