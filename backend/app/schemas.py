from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    # 72 bytes is bcrypt's hard limit on password length.
    password: str = Field(min_length=8, max_length=72)


class SigninRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    selectedDocument: str | None = None
    fields: dict[str, str] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    reply: str
    selectedDocument: str | None
    selectedDocumentName: str | None
    fields: dict[str, str]
