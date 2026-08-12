from fastapi import APIRouter, Depends, HTTPException, status

from ..deps import get_current_user
from ..documents import CatalogEntry, DocumentDetail, get_document_detail, load_catalog

router = APIRouter(prefix="/api/documents", tags=["documents"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[CatalogEntry])
def list_documents() -> list[CatalogEntry]:
    return load_catalog()


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: str) -> DocumentDetail:
    detail = get_document_detail(document_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return detail
