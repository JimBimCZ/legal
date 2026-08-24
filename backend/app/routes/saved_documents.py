from fastapi import APIRouter, Depends, HTTPException, status

from .. import saved_documents as repo
from ..db import Database, get_connection
from ..deps import get_current_user
from ..schemas import (
    CreateSavedDocumentRequest,
    SavedDocumentDetail,
    SavedDocumentSummary,
    SendDocumentMessageRequest,
    SendDocumentMessageResponse,
    UserResponse,
)

router = APIRouter(
    prefix="/api/saved-documents",
    tags=["saved-documents"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[SavedDocumentSummary])
def list_saved_documents(
    user: UserResponse = Depends(get_current_user),
    db: Database = Depends(get_connection),
) -> list[SavedDocumentSummary]:
    return repo.list_documents_for_user(db, user.id)


@router.post("", response_model=SavedDocumentDetail, status_code=status.HTTP_201_CREATED)
def create_saved_document(
    payload: CreateSavedDocumentRequest,
    user: UserResponse = Depends(get_current_user),
    db: Database = Depends(get_connection),
) -> SavedDocumentDetail:
    try:
        return repo.create_document(db, user.id, payload.documentTypeId)
    except repo.UnknownDocumentTypeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown document type"
        ) from exc


@router.get("/{document_id}", response_model=SavedDocumentDetail)
def get_saved_document(
    document_id: int,
    user: UserResponse = Depends(get_current_user),
    db: Database = Depends(get_connection),
) -> SavedDocumentDetail:
    detail = repo.get_document_for_user(db, user.id, document_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return detail


@router.post("/{document_id}/messages", response_model=SendDocumentMessageResponse)
def send_document_message(
    document_id: int,
    payload: SendDocumentMessageRequest,
    user: UserResponse = Depends(get_current_user),
    db: Database = Depends(get_connection),
) -> SendDocumentMessageResponse:
    try:
        return repo.send_message(db, user.id, document_id, payload.content)
    except repo.DocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to reach AI service"
        ) from exc
