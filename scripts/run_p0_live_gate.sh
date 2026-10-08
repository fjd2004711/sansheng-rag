#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="http://127.0.0.1:8010/api/v1"
STAMP="$(date +%Y%m%d%H%M%S)"
EMAIL="p0-gate-${STAMP}@p0-gate.test.com"
PASSWORD="P0Gate-${STAMP}-pass"
COLLECTION="p0_live_gate_${STAMP}"
WORK_DIR="$(mktemp -d)"
mkdir -p "$ROOT/artifacts"
ARTIFACT="$ROOT/artifacts/p0-live-gate.json"
TOKEN=""
DOC_IDS=()

cleanup() {
  if [[ -n "$TOKEN" ]]; then
    curl -fsS -X DELETE -H "Authorization: Bearer $TOKEN" "$API_URL/rag/collections/$COLLECTION" >/dev/null 2>&1 || true
  fi
  docker exec self_correcting_rag_db psql -U postgres -d self_correcting_rag -c "DELETE FROM users WHERE email = '$EMAIL'" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

printf 'P0 TXT evidence: Qdrant is the vector database for the baseline RAG gate.\n' > "$WORK_DIR/p0-gate.txt"
cat > "$WORK_DIR/p0-gate.md" <<'MD'
# P0 Markdown Evidence
The P0 baseline uses LangChain for the document and answer chain.
MD
docker exec self_correcting_rag_backend python -c "from docx import Document; d=Document(); d.add_heading('P0 DOCX Evidence', 0); d.add_paragraph('Top-K dense retrieval is the only retrieval strategy enabled in P0.'); d.save('/tmp/p0-gate.docx')"
docker exec self_correcting_rag_backend python -c "import fitz; d=fitz.open(); p=d.new_page(); p.insert_text((72,72), 'P0 PDF Evidence: every answer must retain a source citation.'); d.save('/tmp/p0-gate.pdf')"
docker cp self_correcting_rag_backend:/tmp/p0-gate.docx "$WORK_DIR/p0-gate.docx" >/dev/null
docker cp self_correcting_rag_backend:/tmp/p0-gate.pdf "$WORK_DIR/p0-gate.pdf" >/dev/null

register_payload="$(python3 - "$EMAIL" "$PASSWORD" <<'PY'
import json, sys
print(json.dumps({"email": sys.argv[1], "password": sys.argv[2], "full_name": "P0 Gate"}))
PY
)"
curl -fsS -X POST "$API_URL/auth/register" -H 'Content-Type: application/json' --data "$register_payload" >/dev/null
docker exec self_correcting_rag_db psql -U postgres -d self_correcting_rag -c "UPDATE users SET role = 'admin', is_app_admin = true WHERE email = '$EMAIL'" >/dev/null
TOKEN="$(curl -fsS -X POST "$API_URL/auth/login" -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode "username=$EMAIL" --data-urlencode "password=$PASSWORD" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
AUTH_HEADER="Authorization: Bearer $TOKEN"
curl -fsS -X POST -H "$AUTH_HEADER" "$API_URL/rag/collections/$COLLECTION" >/dev/null

for file in "$WORK_DIR"/p0-gate.{txt,md,docx,pdf}; do
  response="$(curl -fsS -X POST -H "$AUTH_HEADER" -F "file=@$file" "$API_URL/rag/collections/$COLLECTION/ingest")"
  id="$(printf '%s' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
  DOC_IDS+=("$id")
done

ready=false
for _ in $(seq 1 60); do
  curl -fsS -H "$AUTH_HEADER" "$API_URL/rag/documents?collection_name=$COLLECTION" > "$WORK_DIR/documents.json"
  if python3 - "$WORK_DIR/documents.json" "${DOC_IDS[@]}" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1]))
items = {item["id"]: item for item in payload["items"]}
expected = sys.argv[2:]
if set(expected) != set(items):
    raise SystemExit(1)
if not all(items[item]["status"] == "done" and items[item]["chunk_count"] > 0 for item in expected):
    raise SystemExit(1)
PY
  then
    ready=true
    break
  fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  cat "$WORK_DIR/documents.json" >&2
  exit 1
fi

curl -fsS -X POST -H "$AUTH_HEADER" -H 'Content-Type: application/json' -d "{\"collection_name\":\"$COLLECTION\",\"query\":\"Which P0 evidence mentions Qdrant as the vector database?\",\"limit\":10}" "$API_URL/rag/search" > "$WORK_DIR/search.json"
python3 - "$WORK_DIR/search.json" <<'PY'
import json, sys
results = json.load(open(sys.argv[1]))["results"]
assert results, "retrieval returned no evidence"
assert any("Qdrant" in result["content"] for result in results), "Qdrant evidence was not retrieved"
for result in results:
    assert result["parent_doc_id"], "result lacks parent document id"
    assert "filename" in result["metadata"], "result lacks filename metadata"
    assert "chunk_num" in result["metadata"], "result lacks chunk metadata"
PY

python3 - "$WORK_DIR/documents.json" <<'PY' > "$WORK_DIR/ids.tsv"
import json, sys
for item in json.load(open(sys.argv[1]))["items"]:
    print(item["filename"].rsplit(".", 1)[-1], item["id"], sep="	")
PY
while IFS=$'\t' read -r ext id; do
  curl -fsS -H "$AUTH_HEADER" "$API_URL/rag/documents/$id/download" -o "$WORK_DIR/download.$ext"
  cmp "$WORK_DIR/p0-gate.$ext" "$WORK_DIR/download.$ext"
done < "$WORK_DIR/ids.tsv"

python3 - "$WORK_DIR/documents.json" "$WORK_DIR/search.json" "$ARTIFACT" "$COLLECTION" <<'PY'
import json, sys
documents = json.load(open(sys.argv[1]))
search = json.load(open(sys.argv[2]))
report = {
    "phase": "P0",
    "result": "PASS",
    "checks": {
        "upload_txt_markdown_docx_pdf": "PASS",
        "parse_chunk_embed_qdrant_index": "PASS",
        "dense_top_k_retrieval": "PASS",
        "source_metadata_and_chunk_traceability": "PASS",
        "original_file_download": "PASS"
    },
    "collection": sys.argv[4],
    "documents": documents["items"],
    "search_result_count": len(search["results"])
}
with open(sys.argv[3], "w") as handle:
    json.dump(report, handle, indent=2)
    handle.write("\n")
PY
echo "P0 live gate PASS: $ARTIFACT"
