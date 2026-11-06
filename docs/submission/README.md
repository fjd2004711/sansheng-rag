# 初赛提交材料（赛题一）

| 提交物 | 文件（`out/`） | 生成方式 |
|---|---|---|
| 方案书（PDF） | `赛题一+【队伍名称】+三省-方案书.pdf` | `python docs/submission/build_proposal.py` |
| 方案讲解 PPT | `赛题一+【队伍名称】+三省-方案讲解.pptx` | `python docs/proposal/make_deck_assets.py`，再 `DECK_OUT=… NODE_PATH=<含 pptxgenjs> node docs/proposal/make_deck.js` |
| 演示视频（mp4，不入库） | `赛题一+【队伍名称】+三省-演示视频.mp4` | 见下 |

提交前把文件名里的 `【队伍名称】` 换成真实队名；方案书封面的队伍、成员、指导教师也需要填写（`proposal.template.html` 封面部分）。

## 数据从哪来

所有数字只有一个来源：`build_data.py` 从 `artifacts/orchestration-runs/`（真实运行与全部事件）、`artifacts/verification-eval-*.json`、`artifacts/p5-evaluation-report.json`、源码行数和测试结果汇总成 `data.json`。方案书、PPT、视频旁白都读这一份。

```bash
cd backend && uv run python ../docs/submission/build_data.py --pytest-summary "487 passed, 4 skipped" --vitest 67
python docs/submission/figures.py        # 方案书里的数据图
```

## 截图与视频

都在模拟后端上拍：它直接提供保存的真实运行，`POST /runs` 会把一次真实运行按 `ORCH_MOCK_SPEED` 倍速回放（视频里标注了“真实运行记录 · 8 倍速回放”）。

```bash
cd backend && ORCH_MOCK_SPEED=8 uv run uvicorn scripts.orch_mock_server:app --port 8020
（另拷一份 frontend 到临时目录再运行，不要和正在用的开发服务器共用 .next）BACKEND_URL=http://localhost:8020 npx next dev -p 3100
node scripts/submission-capture.mjs ../docs/submission/shots          # 方案书与 PPT 截图
uv run --with edge-tts python docs/demo/voice.py                      # 旁白（每句单独合成，配自然停顿）与片头片尾卡
node frontend/scripts/demo-record.mjs docs/demo/build                 # 按旁白时间驱动真实界面并录屏（重启模拟后端后再录）
python docs/demo/compose.py                                           # 运镜、字幕、章节标签、配音 → mp4
```

旁白文本在 `docs/demo/voice.py` 的 `SCENES` 里；想换成真人配音，可按 `docs/demo/build/voice.json` 里每句的起止时间录音，替换 `build/voice/<scene>.wav` 后重新运行 `compose.py`。
