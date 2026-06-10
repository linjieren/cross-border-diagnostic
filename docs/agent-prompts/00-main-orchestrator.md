# Main Orchestrator

## Runtime Role

The main orchestrator is implemented in:

- `backend/src/agent/orchestrator.ts`

Its responsibility is to coordinate the full diagnosis pipeline:

1. Read page content.
2. Call the Product Understanding prompt.
3. Run the four diagnostic module tools in parallel.
4. Call the Report Generation prompt.
5. Persist progress and emit events.

## Effective Constraint Set

This role is mostly procedural rather than prompt-driven.

Operational constraints reflected in code:

- Step 1 must happen before step 2.
- Step 2 runs exactly four module tools in parallel:
  - `globalAccelerationTool`
  - `leadPageTool`
  - `productContentTool`
  - `formTrackingTool`
- Step 3 consumes:
  - URL
  - target market
  - product understanding result
  - all tool results
  - session language
- Any failure is stored into `agentSteps` and marks the session as failed.

## Pipeline Shape

### Step 1

Name: `product_understanding`

Input extracted from the target page:

- title
- meta description
- first H1
- first 3000 chars of body text

### Step 2

Name: `tool_execution`

Parallel modules:

- global acceleration
- lead page check
- product content audit
- form tracking

### Step 3

Name: `report_generation`

Output:

- `reportMarkdown`
- `reportHtml`

## Why This Is Not Yet "One Parent + Four Child Agents"

Because the four diagnostic modules are not prompt-based independent agents. They are deterministic functions with page inspection logic, and they do not own separate LLM system prompts.
