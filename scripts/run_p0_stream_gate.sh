#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="http://127.0.0.1:8010/api/v1"
STAMP="$(date +%Y%m%d%H%M%S)"
EMAIL="p0-stream-$STAMP@p0-gate.test.com"
PASSWORD="P0Gate-$STAMP-pass"
WORK_DIR="$(mktemp -d)"
ARTIFACT="$ROOT/artifacts/p0-stream-gate.json"
TOKEN=""
cleanup() {
  docker exec self_correcting_rag_db psql -U postgres -d self_correcting_rag -c "DELETE FROM conversations WHERE user_id IN (SELECT id FROM users WHERE email = '$EMAIL'); DELETE FROM users WHERE email = '$EMAIL';" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT
mkdir -p "$ROOT/artifacts"

payload="$(python3 - "$EMAIL" "$PASSWORD" <<'PY'
import json, sys
print(json.dumps({"email": sys.argv[1], "password": sys.argv[2], "full_name": "P0 Stream Gate"}))
PY
)"
curl -fsS -X POST "$API_URL/auth/register" -H 'Content-Type: application/json' --data "$payload" >/dev/null
TOKEN="$(curl -fsS -X POST "$API_URL/auth/login" -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode "username=$EMAIL" --data-urlencode "password=$PASSWORD" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"

docker exec -i -e P0_GATE_TOKEN="$TOKEN" self_correcting_rag_backend python - <<'PY' > "$WORK_DIR/events.json"
import asyncio, json, os
import websockets

async def run():
    events = []
    url = "ws://127.0.0.1:8010/api/v1/ws/agent"
    protocols = ["access_token." + os.environ["P0_GATE_TOKEN"], "chat"]
    async with websockets.connect(url, subprotocols=protocols, open_timeout=15) as ws:
        await ws.send(json.dumps({
            "type": "message",
            "message": "Which vector database does P0 use? Cite the evidence."
        }))
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=120)
            event = json.loads(raw)
            events.append(event)
            if event.get("type") in {"complete", "error"}:
                break
    event_types = [event.get("type") for event in events]
    assert "tool_call" in event_types, event_types
    assert "tool_result" in event_types, event_types
    assert "text_delta" in event_types, event_types
    assert event_types[-1] == "complete", events[-1]
    tool_calls = [event for event in events if event.get("type") == "tool_call"]
    assert any(event.get("data", {}).get("tool_name") == "search_documents" for event in tool_calls)
    answer = "".join(
        event.get("data", {}).get("content", "")
        for event in events if event.get("type") == "text_delta"
    )
    assert "Qdrant" in answer, answer
    assert "[1]" in answer, answer
    print(json.dumps({"events": events, "answer": answer}))

asyncio.run(run())
PY

python3 - "$WORK_DIR/events.json" "$ARTIFACT" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
report = {
    "phase": "P0",
    "result": "PASS",
    "checks": {
        "websocket_connectivity": "PASS",
        "required_search_documents_tool_call": "PASS",
        "tool_result_stream": "PASS",
        "text_delta_stream": "PASS",
        "citation_in_final_answer": "PASS"
    },
    "event_types": [event["type"] for event in data["events"]],
    "answer": data["answer"]
}
with open(sys.argv[2], "w") as handle:
    json.dump(report, handle, indent=2)
    handle.write("\n")
PY
echo "P0 stream gate PASS: $ARTIFACT"
