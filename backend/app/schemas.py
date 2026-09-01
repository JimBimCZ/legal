from typing import Literal

from pydantic import BaseModel, Field


class UserResponse(BaseModel):
    id: int
    email: str
    github_login: str
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


class SavedDocumentSummary(BaseModel):
    id: int
    documentTypeId: str
    documentTypeName: str
    createdAt: str
    updatedAt: str


class SavedDocumentDetail(SavedDocumentSummary):
    fields: dict[str, str]
    messages: list[ChatMessage]


class CreateSavedDocumentRequest(BaseModel):
    documentTypeId: str


class SendDocumentMessageRequest(BaseModel):
    content: str = Field(min_length=1)


class SendDocumentMessageResponse(BaseModel):
    reply: str
    selectedDocument: str
    selectedDocumentName: str
    fields: dict[str, str]
    updatedAt: str
