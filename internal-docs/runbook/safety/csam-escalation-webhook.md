# CSAM Escalation Webhook Runbook

## Purpose
Defines the backend escalation path for high-severity safety reports.

## Trigger Conditions
- Always escalated: `CSAM`
- Configurable escalation: `GROOMING_OR_SEXUAL_EXPLOITATION` when `SAFETY_ESCALATE_GROOMING=true`

## Delivery Mechanism
`ReportingService.notifySafetyMailbox` sends a `POST` webhook with JSON payload:

```json
{
  "event": "safety_report_escalated",
  "reportId": "<report-id>",
  "category": "CSAM",
  "escalatedAt": "<iso-timestamp>"
}
```

## Configuration
Set in `backend/.env`:

- `SAFETY_ALERT_WEBHOOK_URL`: destination URL for safety inbox automation
- `SAFETY_ESCALATE_GROOMING`: `true|false`

## Failure Behavior
- Report creation must still succeed for end users if webhook delivery fails.
- Delivery failures are logged as `safety_notification_failed`.

## Verification
1. Submit a CSAM report from the app.
2. Confirm DB row is `status=ESCALATED`.
3. Confirm webhook receiver got the event payload with the correct `reportId`.
4. If webhook receiver is down, verify report still returns success and backend logs `safety_notification_failed`.
