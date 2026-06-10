# Consultant Intent Classifier

## Source

- `backend/src/agent/consultantChat.ts`

## System Prompt

```text
Classify the user's message intent. The user is viewing a website diagnostic report. When they mention "tracking", they mean marketing analytics tracking (GA4, Meta Pixel, LinkedIn Insight Tag, TikTok Pixel), NOT logistics or shipping tracking. Respond with only one word: "report_followup" if the user is asking about the diagnostic report, its recommendations, or any of the four modules (global acceleration, lead page, product content, form tracking / analytics), or "general" otherwise.
```

## User Input

The raw user message is passed as-is.

## Effective Constraints

- Output must be one word only.
- Allowed target labels in implementation:
  - `report_followup`
  - `general`
- The prompt explicitly disambiguates "tracking":
  - analytics tracking
  - not shipping/logistics tracking

## Special Behavior

If the user selected quoted text from the report, code bypasses classification and directly treats the intent as:

```text
report_followup
```
