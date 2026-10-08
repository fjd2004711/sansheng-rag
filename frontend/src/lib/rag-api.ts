/**
 * RAG (Retrieval Augmented Generation) API client.
 */

import { apiClient } from "./api-client";

export const RAG_API_ROUTES = {
  COLLECTIONS: "/v1/rag/collections",
  COLLECTIONS_INFO: (name: string) => `/v1/rag/collections/${name}/info`,
  COLLECTIONS_CREATE: (name: string) => `/v1/rag/collections/${name}`,
  COLLECTIONS_DELETE: (name: string) => `/v1/rag/collections/${name}`,
  COLLECTIONS_DOCUMENTS: (name: string) => `/v1/rag/collections/${name}/documents`,
  COLLECTIONS_DOCUMENT_DELETE: (name: string, documentId: string) =>
    `/v1/rag/collections/${name}/documents/${documentId}`,
  COLLECTIONS_INGEST: (name: string) => `/v1/rag/collections/${name}/ingest`,
  SEARCH: "/v1/rag/search",
} as const;

export interface RAGCollectionList {
  items: string[];
}

export interface RAGCollectionInfo {
  name: string;
  total_vectors: number;
  dim: number;
  indexing_status: string;
}

export interface RAGSearchRequest {
  query: string;
  collection_name?: string;
  collection_names?: string[];
  limit?: number;
  min_score?: number;
  filter?: string;
}

export interface RAGSearchResult {
  content: string;
  metadata: Record<string, unknown>;
  score: number;
  parent_doc_id: string;
}

export interface RAGSearchResponse {
  results: RAGSearchResult[];
}

export const isRagEnabled = (): boolean => {
  return process.env.NEXT_PUBLIC_RAG_ENABLED === "true";
};

export async function listCollections(): Promise<RAGCollectionList> {
  return apiClient.get<RAGCollectionList>(RAG_API_ROUTES.COLLECTIONS);
}

export async function getCollectionInfo(collectionName: string): Promise<RAGCollectionInfo> {
  return apiClient.get<RAGCollectionInfo>(RAG_API_ROUTES.COLLECTIONS_INFO(collectionName));
}

export async function createCollection(collectionName: string): Promise<{ message: string }> {
  return apiClient.post<{ message: string }>(RAG_API_ROUTES.COLLECTIONS_CREATE(collectionName));
}

export async function deleteCollection(collectionName: string): Promise<void> {
  return apiClient.delete(RAG_API_ROUTES.COLLECTIONS_DELETE(collectionName));
}

export async function deleteDocument(collectionName: string, documentId: string): Promise<void> {
  return apiClient.delete(RAG_API_ROUTES.COLLECTIONS_DOCUMENT_DELETE(collectionName, documentId));
}

export async function searchDocuments(request: RAGSearchRequest): Promise<RAGSearchResponse> {
  return apiClient.post<RAGSearchResponse>(RAG_API_ROUTES.SEARCH, request);
}

export interface RAGDocumentItem {
  document_id: string;
  filename: string;
  filesize: number;
  filetype: string;
  chunk_count: number;
  additional_info?: Record<string, unknown>;
}

export interface RAGDocumentList {
  items: RAGDocumentItem[];
  total: number;
}

export interface RAGIngestResult {
  id: string;
  status: string;
  document_id: string | null;
  filename: string;
  collection: string;
  message: string;
}

export interface RAGTrackedDocument {
  id: string;
  collection_name: string;
  filename: string;
  filesize: number;
  filetype: string;
  status: "processing" | "done" | "error";
  error_message: string | null;
  vector_document_id: string | null;
  chunk_count: number;
  has_file: boolean;
  created_at: string | null;
  completed_at: string | null;
}

export function getDocumentDownloadUrl(docId: string): string {
  return `/api/v1/rag/documents/${docId}/download`;
}

export interface RAGTrackedDocumentList {
  items: RAGTrackedDocument[];
  total: number;
}

export async function listTrackedDocuments(
  collectionName?: string,
): Promise<RAGTrackedDocumentList> {
  const params = collectionName ? `?collection_name=${encodeURIComponent(collectionName)}` : "";
  return apiClient.get<RAGTrackedDocumentList>(`/v1/rag/documents${params}`);
}

export async function deleteTrackedDocument(docId: string): Promise<void> {
  return apiClient.delete(`/v1/rag/documents/${docId}`);
}

export async function listDocuments(collectionName: string): Promise<RAGDocumentList> {
  return apiClient.get<RAGDocumentList>(RAG_API_ROUTES.COLLECTIONS_DOCUMENTS(collectionName));
}

export async function ingestFile(
  collectionName: string,
  file: File,
  replace = false,
): Promise<RAGIngestResult> {
  const formData = new FormData();
  formData.append("file", file);

  // Through apiClient so an expired access token is refreshed and the upload retried once.
  const endpoint = `${RAG_API_ROUTES.COLLECTIONS_INGEST(collectionName)}${replace ? "?replace=true" : ""}`;
  return apiClient.post<RAGIngestResult>(endpoint, formData);
}
