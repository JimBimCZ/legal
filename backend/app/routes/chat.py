from fastapi import APIRouter, HTTPException, status

from ..nda_chat import run_chat_turn
from ..schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    llm_messages = [{"role": m.role, "content": m.content} for m in payload.messages]
    try:
        result = run_chat_turn(llm_messages, payload.fields)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to reach AI service"
        ) from exc
    return ChatResponse(reply=result.reply, fields=result.fields)
