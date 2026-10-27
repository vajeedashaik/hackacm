# FAIRSHIFT FINAL PHASE — FULL SYSTEM INTEGRATION, END-TO-END VERIFICATION AND DEPLOYMENT

You are the principal engineer responsible for integrating and releasing FairShift for Prompt Wars 2026.

This is a fresh Claude Code session. You do not have access to previous conversations. The current repository, its documentation, source code, tests, migrations, and configuration are the source of truth.

Do not assume that any feature works merely because its code exists. Verify it.

Your objective is to make the entire application function as one connected system, fix integration defects, and deploy the verified application to Google Cloud Run.

Do not merely generate an audit report. Perform the necessary safe, authorised work.

## 1. RECONSTRUCT THE ACTUAL SYSTEM

Inspect:
- CLAUDE.md and the tooling manifest.
- All application routes and React components.
- Backend services, database schema, migrations, and RLS policies.
- Worker and employer workflows.
- Phaser simulation and event adapter.
- AI agent orchestration and tools.
- Vapi integration.
- Event feed and notifications.
- Environment configuration.
- Tests, Docker files, and deployment instructions.
- Git status, branches, tracked files, and repository size.

Create an integration map showing the actual connections between components.

Identify missing modules, incompatible interfaces, duplicated state, stale assumptions, and incomplete implementations.

Do not recreate working components unnecessarily.

## 2. VERIFY THE THREE PRIMARY INTERFACES

Confirm that all three destinations work:

1. Worker Dashboard.
2. Employer Dashboard.
3. Live Workplace Simulation.

Check navigation, loading, error states, responsive layout, and access restrictions.

Every visible control must either perform its intended action or clearly indicate that the capability is unavailable.

## 3. VERIFY SHARED DATA

Trace each important action from the user interface through business logic and persistence.

Confirm that:
- The worker dashboard uses the correct records.
- The employer dashboard uses the same underlying records.
- The simulation reflects relevant persisted events.
- Agent events are connected to actual runs and records.
- Case status changes propagate to the relevant interfaces.
- Realtime updates are correctly subscribed to and cleaned up.
- The demo fallback is clearly distinguished from live backend operations.

Remove duplicated hardcoded state when it conflicts with the shared backend.

Where live credentials are unavailable, test the local/demo path and document the unverified external connection. Never pretend a live database or service was tested if it was not.

## 4. RUN THE COMPLETE WAGE-DISCREPANCY SCENARIO

Execute the following end-to-end workflow:

1. A worker starts with a recorded shift.
2. The worker's recorded hours are compared with configured pay rules.
3. A wage discrepancy is detected or reported.
4. A fairness case is created and persisted.
5. The attendance and wage agents retrieve permitted evidence.
6. Deterministic calculation logic establishes the expected amount.
7. AI agents explain the evidence and recommend an action.
8. The employer reviews the case.
9. An authorised reviewer records a decision.
10. The backend validates and persists the state transition.
11. The worker sees the updated status.
12. The employer dashboard shows the same outcome.
13. The event feed records the relevant events.
14. The Phaser simulation reflects the associated workplace activity.
15. The audit history records the important actions.

Verify the database records and state transitions. A visual animation alone is not proof of success.

## 5. TEST THE OTHER CRITICAL WORKFLOWS

Verify:
- Safety incident reporting and case tracking.
- Excessive-hours and fatigue alerts.
- Confidential or anonymous feedback permissions.
- Skill passport updates.
- Shift check-in and check-out.
- Case dispute and reopening.
- Tamil and English interface support.
- Construction and college facilities configurations.
- Agent timeout and deterministic fallback.
- Voice workflows when Vapi credentials are available.

Ensure urgent safety reports are not blocked by model availability.

## 6. VERIFY AI AND VOICE INTEGRATION

For each agent, verify:
- The invocation path.
- Its input validation.
- Its allowed tools.
- Its permission checks.
- Its output handling.
- Its event recording.
- Its error and timeout behaviour.

Verify that agents cannot independently approve financial adjustments, bypass case permissions, or expose confidential information.

For Vapi, test the actual configured voice workflow if credentials are available. Confirm that server-side tool calls are authenticated and authorised.

If credentials or permissions are unavailable, report the exact blocker and verify the non-voice fallback.

## 7. SECURITY AND ACCESSIBILITY REGRESSION

Run the relevant tests for:
- RLS and cross-organisation access.
- Worker privacy.
- Anonymous feedback privacy.
- Agent authorization.
- Input validation.
- Secret exposure.
- Keyboard navigation and focus.
- Accessible labels and contrast.
- Reduced motion.
- Mobile layout.
- Error handling.

Fix high-severity defects before release.

Do not disable tests, weaken permissions, or remove required functionality to obtain a passing build.

## 8. BUILD, TEST, AND REPAIR ITERATIVELY

Run the actual commands supported by the repository for:
- Dependency validation.
- Linting.
- Type checking.
- Unit tests.
- Integration tests.
- Production build.
- Browser end-to-end tests.
- Database migration validation.
- Container build.

Inspect failures, fix their underlying causes, and rerun affected checks.

Do not claim a check passed unless its result confirms success.

If a check cannot run, explain why.

## 9. DEPLOY TO GOOGLE CLOUD RUN

Google Cloud Run is mandatory for the final submission.

Check whether Google Cloud CLI, credentials, project selection, billing, required APIs, and deployment permissions are configured.

If ready:
1. Build the production container.
2. Deploy to Google Cloud Run.
3. Configure environment variables and secrets securely.
4. Verify the health endpoint and application startup.
5. Test all three interfaces using the deployed URL.
6. Execute the main workflow against the deployed configuration.
7. Verify database connectivity and configured external integrations.
8. Fix deployment-specific failures and redeploy as needed.

Never expose secret values in output or commit them.

Ask for my approval before activating paid resources, changing billing, making irreversible changes, or performing any action requiring explicit authorization.

If deployment is blocked, complete all possible preparation and state the exact action I must take. Do not invent a live URL.

## 10. VERIFY GITHUB SUBMISSION REQUIREMENTS

Check the actual repository:
- It is public or ready to be made public.
- The submission URL ends in .git.
- Exactly one branch exists for the submission.
- The initial repository size is strictly under 10 MB.
- Build artefacts, node_modules, large generated assets, and secrets are excluded.
- Git history has been checked for exposed credentials.
- README instructions are accurate.
- Setup, testing, and deployment instructions are present.

Do not rewrite Git history or publish the repository without approval.

## 11. FINAL SUBMISSION PACKAGE

Prepare:
- Final README.
- Architecture overview.
- Feature list tied to SDG 8.
- Setup and environment-variable documentation.
- Database and seed instructions.
- Demo workflow.
- Test results.
- Verified Cloud Run URL.
- GitHub .git submission URL.
- A truthful LinkedIn post draft explaining the problem, implementation, and solution fit.
- A checklist for the Innovator Dashboard.

Do not claim that the dashboard submission is complete unless it has actually been submitted and verified.

## FINAL ACCEPTANCE GATE

The application is ready only when:

- All three interfaces work.
- At least three meaningful features work end to end.
- Both industry configurations work.
- The main wage-discrepancy scenario completes.
- Shared records and events remain consistent.
- Agent actions are permission-checked.
- Critical tests pass.
- High-severity known defects are resolved.
- The deployed Cloud Run application has been tested, if deployment credentials permit.
- All GitHub submission constraints have been verified.

At the end, produce a concise release report with four categories:

A. VERIFIED WORKING  
B. FIXED DURING INTEGRATION  
C. BLOCKED BY MISSING CREDENTIALS OR APPROVAL  
D. NOT YET COMPLETE

Include actual test results and verified URLs. Distinguish demo-mode success from live-service success.

Do not hide failures or mark incomplete features as complete. Continue fixing issues until the acceptance criteria are met or a genuine external blocker prevents progress.