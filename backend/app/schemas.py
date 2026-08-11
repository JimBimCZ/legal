from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from .nda_chat import NdaFields


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
    fields: NdaFields = NdaFields()


class ChatResponse(BaseModel):
    reply: str
    fields: NdaFields
