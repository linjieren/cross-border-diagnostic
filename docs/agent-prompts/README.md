# Agent Prompt Overview

## Current Architecture

This project does **not** currently implement a strict "one parent agent + one child agent per module" runtime architecture.

What exists today is:

1. A main orchestrator that runs a 3-step pipeline.
2. One LLM prompt for product understanding.
3. Four deterministic diagnostic tools for module checks.
4. One LLM prompt for report generation.
5. One LLM prompt for consultant chat.
6. One small LLM prompt for consultant intent classification.

So if we describe it in "agent" language, the closest mapping is:

- Main agent:
  - `backend/src/agent/orchestrator.ts`
- Prompt-driven sub roles:
  - Product Understanding Agent
  - Report Generation Agent
  - Consultant Chat Agent
  - Consultant Intent Classifier
- Non-LLM module executors:
  - Global Acceleration Tool
  - Lead Page Check Tool
  - Product Content Audit Tool
  - Form Tracking Tool

## Source of Truth

These Markdown files are extracted from the current implementation and normalized for reading.

Code sources:

- `backend/src/agent/orchestrator.ts`
- `backend/src/agent/reportGenerator.ts`
- `backend/src/agent/consultantChat.ts`
- `backend/src/agent/trustedSources.ts`
- `backend/src/agent/tools/*.ts`

## File Map

- `00-main-orchestrator.md`
- `01-product-understanding-agent.md`
- `02-report-generation-agent.md`
- `03-consultant-chat-agent.md`
- `04-consultant-intent-classifier.md`

## Important Note

The four module files under `backend/src/agent/tools/` are currently **tools**, not autonomous child agents with their own prompt files.

They contain:

- fixed Playwright-based checks
- hard-coded scoring logic
- hard-coded finding wording

So if you want a future "one module = one child agent prompt" design, that would be a new architecture change rather than something already present in this repo.
