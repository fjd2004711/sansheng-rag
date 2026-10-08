"""Send questions to a running backend over the agent WebSocket and print the trace.

    cd backend && uv run python ../scripts/probe_agent.py --email a@b.c --password ... "问题1" "问题2"

Prints each structured agent_trace event (step / round / status) and the final answer, so you can
see which correction path a question takes without opening the UI.
"""

import argparse
import asyncio
import json
import urllib.parse
import urllib.request

import websockets


def login(base: str, email: str, password: str) -> str:
    data = urllib.parse.urlencode({"username": email, "password": password}).encode()
    with urllib.request.urlopen(urllib.request.Request(f"{base}/api/v1/auth/login", data=data)) as r:
        return json.load(r)["access_token"]


async def ask(base: str, token: str, question: str, timeout: float, verbose: bool = False) -> None:
    ws_url = base.replace("http", "ws", 1) + "/api/v1/ws/agent"
    print(f"\n=== {question}")
    async with websockets.connect(ws_url, subprotocols=[f"access_token.{token}", "chat"]) as ws:
        await ws.send(json.dumps({"type": "message", "message": question}))
        answer = ""
        async with asyncio.timeout(timeout):
            async for raw in ws:
                event = json.loads(raw)
                kind, data = event["type"], event.get("data") or {}
                if verbose:
                    print(f"  ~{kind}", json.dumps(data, ensure_ascii=False)[:160] if kind != "text_delta" else "")
                if kind == "agent_trace":
                    detail = data.get("detail") or {}
                    extra = detail.get("rewritten_query") or detail.get("sub_query") or detail.get("to") or detail.get("query") or ""
                    reason = detail.get("failure_type") or ""
                    print(f"  [{data.get('status'):9}] {data.get('step')} r{data.get('round')} {reason} {extra}".rstrip())
                elif kind in ("tool_call", "tool_result") and verbose:
                    print(f"  <{kind}> {json.dumps(data, ensure_ascii=False)[:300]}")
                elif kind == "final_result":
                    answer = data.get("output", "")
                elif kind == "error":
                    print("  ERROR:", data)
                    break
                if kind == "complete":
                    break
        print("  ANSWER:", answer.strip().replace("\n", " "))


async def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://localhost:8010")
    p.add_argument("--email", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--timeout", type=float, default=240)
    p.add_argument("--verbose", action="store_true", help="also print raw tool_call events")
    p.add_argument("questions", nargs="+")
    a = p.parse_args()
    token = login(a.base, a.email, a.password)
    for q in a.questions:
        await ask(a.base, token, q, a.timeout, a.verbose)


asyncio.run(main())
