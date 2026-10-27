# FAIRSHIFT — FINAL ZERO-COMPROMISE CODEBASE AUDIT, ADVERSARIAL QA & SUBMISSION VALIDATION

## ROLE

Act as a combination of:

- A strict hackathon AI evaluator trying to identify every weakness in my submission.
- A senior software architect reviewing the complete application.
- An application security engineer performing an adversarial security audit.
- A QA engineer validating every user workflow and edge case.
- An accessibility and usability auditor.
- A DevOps engineer validating deployment, repository hygiene, and reproducibility.
- A skeptical judge assessing whether the product solves the selected real-world problem or merely demonstrates an attractive interface.

Your mission is to audit FairShift against the challenge requirements, identify every meaningful deduction risk, fix all issues you can safely fix, and produce evidence that the final submission is genuinely ready.

**Do not behave like a supportive assistant. Behave like an unforgiving evaluator.**

Do not praise the project unless the evidence warrants it. Do not assume features work because their screens exist. Do not award credit for placeholder implementations, hardcoded metrics, simulated AI presented as real AI, unconnected buttons, fabricated test results, or claims in the README that the code does not substantiate.

Do not promise a perfect score. Maximize verified compliance and explicitly disclose every remaining limitation.

---

# 1. THE OFFICIAL EVALUATION REQUIREMENTS

Use these requirements as the authoritative baseline.

## A. Mandatory submission rules

1. The GitHub repository must be public.
2. The repository must contain the complete project code required to run and evaluate the solution.
3. The repository size must be strictly less than 10 MB.
4. The repository must contain exactly one branch.
5. The submission must include the public GitHub repository URL.
6. The README must explain:
   - The chosen challenge vertical.
   - The solution approach and logic.
   - How the solution works.
   - Assumptions made.
7. The final deployed application must use Google Cloud Run, as required by the official submission guide.
8. The required submission materials must be consistent, accessible, and verifiable.

Do not confuse repository size with the size of the deployed container image. Measure and report the repository size using an explicitly documented method. Check the actual GitHub repository state when network access and permissions permit.

The official rules allow a maximum of two submission attempts. Do not submit, resubmit, or consume an attempt during this audit. Treat the audit as preparation for the final permitted submission.

## B. Challenge expectations

The solution must demonstrate:

- A smart, dynamic assistant.
- Logical decisions based on user context.
- Practical real-world usability.
- Clean, maintainable code.
- A clearly selected challenge vertical.
- Functionality and logic designed around the chosen persona and real-world problem.

## C. Evaluation categories

Audit each category independently:

1. Code quality.
2. Security.
3. Efficiency.
4. Testing.
5. Accessibility.
6. Problem statement alignment.

The official guidelines mention high-, medium-, and low-impact criteria but do not provide their exact mappings. Do not invent an official scoring breakdown. Instead, create your own clearly labelled risk-based prioritization, putting mandatory submission failures and core functional/security failures first.

---

# 2. FAIRSHIFT PRODUCT CONTEXT

FairShift is an AI-powered workplace fairness platform aligned with UN Sustainable Development Goal 8: Decent Work and Economic Growth.

Its purpose is to address workplace problems including:

- Unclear wages and unrecorded overtime.
- Difficulty reporting safety hazards.
- Fear of retaliation when raising concerns.
- Poor visibility into unresolved worker grievances.
- Excessive working hours and fatigue risks.
- Fragmented attendance, skill, and training records.
- Limited accessibility for workers using basic smartphones or regional languages.

The intended industries are:

1. Construction sites.
2. College or campus facilities management.

The application is intended to include two primary interfaces and an interactive simulation:

### Worker interface

- Shift check-in/check-out and attendance history.
- Overtime visibility.
- Transparent wage breakdowns.
- Wage discrepancy reporting.
- Safety incident reporting.
- Confidential or anonymous feedback where genuinely supported.
- Case status tracking.
- Skills and training history.
- Fatigue alerts where supported by available evidence.
- Tamil/English language access.
- Voice-assisted interactions where configured.
- Mobile-friendly and accessible controls.

### Employer interface

- Workforce overview.
- Attendance and overtime exceptions.
- Wage discrepancy review.
- Safety and grievance case management.
- Case assignment and status transitions.
- Evidence review.
- Fatigue-related alerts.
- Skills and training visibility.
- Audit history and appropriate notifications.
- Industry-specific configuration.

### Interactive workplace simulation

- Genuine interactive 2D workplace environment.
- Construction and campus/facilities scenarios.
- Selectable workers, work areas, incidents, and relevant agent activity.
- Controls for starting, pausing, resuming, and resetting scenarios.
- Visible case and event progression.
- Clear distinction between simulated events and actual persisted application activity.

### AI-assisted investigation

The intended system uses specialised, bounded agent roles, potentially including:

- Worker Persona Agent.
- Supervisor Persona Agent.
- Attendance Agent.
- Wage Analysis Agent.
- Safety Triage Agent.
- Fairness Case Agent.
- Orchestrator.

AI may retrieve authorised evidence, classify concerns, explain calculations, summarise records, and recommend actions.

AI must not independently invent facts, expose protected identities, bypass authorisation, approve payroll without authorised controls, or falsely mark a case as resolved.

Wage calculations and other consequential business rules must be deterministic and testable.

**Important:** This is the intended product scope, not proof that these features exist. Verify every feature against the actual code, configuration, tests, and observed application behaviour. Mark anything missing, incomplete, or unverified accordingly.

---

# 3. AUDIT RULES — NON-NEGOTIABLE

Follow these rules throughout the audit.

1. Inspect the complete repository before making conclusions.
2. Read the README, project instructions, architecture documentation, dependency manifests, environment examples, migrations, server routes, frontend components, agent tools, tests, Docker configuration, and deployment configuration.
3. Discover the real technology stack rather than assuming the intended stack was implemented.
4. Map each requirement to the files, functions, tests, and runtime evidence that support it.
5. Execute the application and tests whenever the environment permits.
6. Trace complete workflows across frontend, backend, database, AI integrations, and simulation.
7. Use browser automation where available.
8. Test unauthorised access and invalid state transitions using controlled test accounts and a safe environment.
9. Never expose, print, or copy actual secrets into audit reports.
10. Never use production data for destructive testing.
11. Do not delete real user data, reset a production database, alter live payroll, or perform irreversible actions without explicit approval.
12. Never disable failing tests, weaken security controls, or remove functionality merely to make a check pass.
13. Do not fabricate screenshots, test results, coverage percentages, successful deployments, or public repository verification.
14. If a dependency, credential, service, or tool is unavailable, state exactly what could not be verified and why.
15. Distinguish static code inspection from executed tests and externally verified behaviour.
16. Make focused, maintainable fixes instead of introducing unnecessary rewrites or new dependencies.
17. After every meaningful fix, rerun the relevant tests.
18. After all fixes, rerun the complete feasible validation suite.
19. Preserve existing project functionality and all intended features.
20. Do not deploy or submit automatically. Ask before any action that could incur cost, alter a live service, or consume a submission attempt.

Use this evidence vocabulary for every important claim:

- **PASS — Verified:** Supported by direct execution, a successful test, or reliable external verification.
- **PARTIAL:** Some functionality exists, but important behaviour is missing or incomplete.
- **FAIL:** A requirement is demonstrably violated.
- **UNVERIFIED:** Evidence is insufficient or the required test could not be performed.
- **NOT APPLICABLE:** Explain why the requirement genuinely does not apply.

Never treat UNVERIFIED as PASS.

---

# 4. PHASE ONE — REPOSITORY DISCOVERY AND BASELINE

Before editing anything:

1. Identify the repository root and inspect all tracked files.
2. Inspect the Git working tree, current branch, configured remotes, recent commit history, and available branches.
3. Inspect the dependency manifests and lockfiles.
4. Identify frontend, backend, database, authentication, AI, voice, simulation, testing, and deployment components.
5. Read existing project instructions and architecture documents.
6. Identify the actual runtime commands.
7. Identify the environment variables required by the application without revealing their values.
8. Identify optional integrations and their fallback behaviour.
9. Inspect database migrations, seed data, RLS policies, API routes, middleware, webhooks, and server-side actions.
10. Inventory all routes, major features, and user roles.
11. Identify existing tests and what they actually cover.
12. Determine whether the current application can start successfully.
13. Record baseline build, lint, type-check, test, and runtime results.
14. Identify existing defects before introducing modifications.

Produce an initial inventory containing:

| Area | What to record |
|---|---|
| Architecture | Actual framework, services, data flow |
| Interfaces | Routes, roles, screens |
| Backend | API endpoints, services, business logic |
| Persistence | Tables, migrations, RLS, relationships |
| AI | Providers, agents, tool schemas, fallbacks |
| Simulation | Engine, events, state, integration |
| Voice | Provider, workflows, language support |
| Tests | Test types, commands, actual baseline results |
| Deployment | Dockerfile, Cloud Run configuration |
| GitHub | Visibility, branches, repository size |
| Risks | Confirmed defects and unverified assumptions |

Do not start refactoring before understanding the architecture.

---

# 5. PHASE TWO — REQUIREMENT TRACEABILITY

Create a complete requirement-to-evidence matrix.

For every official criterion and every intended core product capability, record:

- Requirement ID.
- Requirement description.
- Importance and rationale.
- Relevant implementation files.
- Actual behaviour.
- Test or verification procedure.
- Evidence of the result.
- Status.
- Remaining defect or limitation.
- Required corrective action.

Include the mandatory repository rules, README requirements, Cloud Run requirement, all six evaluation categories, the smart-assistant expectation, context-aware logic, both industries, both user interfaces, and the simulation.

Look for the following particularly dangerous false positives:

- A dashboard with hardcoded statistics instead of real records.
- A form that looks functional but does not persist data.
- A chatbot that responds generically without accessing authorised application context.
- AI agents that merely have different names but perform the same placeholder action.
- A wage discrepancy feature that never performs a real deterministic calculation.
- A safety report that never creates a reviewable case.
- A case status that changes only in local UI state.
- An employer action that never updates the worker's view.
- An anonymous report that records identifying information without disclosure or protection.
- A Tamil selector that changes labels only partially.
- A voice interface that cannot perform its advertised workflow.
- A simulation that presents hardcoded events as live AI decisions.
- Two industry selectors that render the same generic data without meaningful contextual differences.
- Tests that only assert that a page renders.
- Documentation describing features that are not implemented.

Assign priority as follows:

**P0 — Submission blocker or critical security/data-integrity failure.**

**P1 — Major feature, workflow, correctness, or evaluation failure.**

**P2 — Important accessibility, reliability, performance, or maintainability defect.**

**P3 — Polish and low-risk improvements.**

This is an internal audit priority system, not an official hackathon scoring classification.

---

# 6. PHASE THREE — END-TO-END FUNCTIONAL AUDIT

Test every core feature through its actual interface and backend.

## A. Attendance and shift management

Verify:

- Valid check-in and check-out.
- Duplicate check-in handling.
- Check-out without a valid check-in.
- Invalid or future timestamps.
- Time-zone handling.
- Shift boundaries and overnight shifts if supported.
- Break handling if supported.
- Attendance history.
- Overtime rules and boundaries.
- Permission checks for attendance corrections.
- Persistence after refresh and a new session.
- Employer visibility of permitted attendance records.

Test boundary conditions and invalid inputs.

## B. Transparent wages and overtime

Verify:

- The source of each wage input.
- Contracted rates and applicable pay rules.
- Ordinary hours, overtime hours, and the correct configured overtime multiplier.
- Break deductions, rounding, currency, and date-range rules where applicable.
- Missing, contradictory, or incomplete source records.
- Correct distinction between an estimate, a calculated amount, and confirmed payroll.
- Deterministic repeatability of calculations.
- Traceable explanation of each calculation.
- Wage discrepancy creation and persistence.
- Employer review and authorised decision-making.
- Updated case status visible to the worker.

Create independent test fixtures with known expected results. Recalculate the expected outputs separately instead of simply asserting that the implementation agrees with itself.

Never imply that a demonstration calculation is a legally validated payroll determination unless that claim has been substantiated.

## C. Safety reporting

Verify:

- Report creation and validation.
- Category, severity, description, and location fields where applicable.
- Safe handling of attachments, if supported.
- Case creation and evidence linkage.
- Duplicate and repeated submission behaviour.
- Appropriate urgency and escalation.
- Employer review and action recording.
- Worker-visible status updates.
- Audit history.
- Access restrictions on sensitive evidence.

Check that dangerous reports are not silently discarded because an AI provider fails.

## D. Feedback, grievances, and confidentiality

Verify:

- The actual difference between anonymous and confidential reporting.
- Whether identity is collected, stored, or exposed.
- Whether authentication, metadata, attachments, logs, or audit records can reveal identity.
- Who can read the original report.
- Whether employers can access information they should not see.
- Case assignment and review.
- Resolution and dispute/reopening workflows.
- Protection against unauthorised deletion or status changes.
- Appropriate messaging about the limits of anonymity.

Do not claim that reporting is anonymous unless the implementation supports that claim.

## E. Skills, training, and fatigue

Verify:

- Skills and training records persist.
- Workers cannot edit other workers' records without permission.
- Employers see only authorised information.
- Fatigue alerts have documented rules and traceable inputs.
- Missing or stale data does not produce misleading certainty.
- Alerts can be reviewed and handled appropriately.
- The interface distinguishes a risk indicator from a medical or definitive determination.

Mark any advertised but missing feature as PARTIAL or FAIL.

## F. Employer case-management workflow

Verify the complete lifecycle:

Report created → case persisted → evidence linked → category and priority assigned → authorised reviewer sees case → reviewer records an action → state transition validated → audit entry recorded → worker receives an appropriate update → worker can inspect the outcome → dispute or reopening works where supported.

Test:

- Invalid state transitions.
- Repeated actions.
- Concurrent updates.
- Stale browser state.
- Duplicate requests.
- Unauthorised case assignment.
- Cross-organisation access.
- Failed database operations.
- Notification failures.
- Attempts to resolve a case without the required evidence or permission.

All important state changes must be persisted and validated server-side.

## G. Industry support

Test both construction and college/campus facilities management.

Verify meaningful differences in:

- Work areas and job roles.
- Shift configuration.
- Relevant hazards.
- Case categories.
- Workforce views.
- Scenario content.
- Industry-specific assumptions and rules.

Shared infrastructure is desirable. Duplicated code is not required. However, merely changing the industry name is insufficient.

## H. Interactive simulation

Verify:

- The simulation is genuinely interactive.
- Start, pause, resume, and reset work.
- Industry and scenario switching work.
- Characters and relevant objects can be selected.
- Relevant worker or case details are displayed with correct permissions.
- Events appear in a consistent order.
- State transitions are meaningful.
- Repeated reset and remount cycles do not duplicate listeners.
- The simulation remains usable on smaller screens.
- Keyboard alternatives exist for essential interactions.
- Deterministic demo events are visibly distinguished from real persisted events and actual AI invocations.
- Simulation state cannot falsely claim that an unresolved real case was resolved.

If the simulation is a visual representation of persisted cases, verify that the mapping is accurate and appropriately permissioned.

## I. AI agents and orchestration

Inspect each agent's actual implementation.

For every agent, identify:

- Defined responsibility.
- Permitted data access.
- Available tools.
- Input validation.
- Output schema.
- Error handling.
- Timeout and retry behaviour.
- Logging and privacy controls.
- Effect on the application state.

Verify that:

- Agents use real application context when needed.
- Evidence is grounded in retrieved records.
- Unknown facts remain unknown rather than being invented.
- Model output is validated before use.
- Tool permissions are enforced server-side.
- AI cannot execute arbitrary database operations.
- AI cannot override deterministic wage calculations.
- AI cannot bypass role checks.
- AI cannot expose confidential reporter identities.
- AI recommendations are distinguished from authorised decisions.
- Failed model calls have safe, understandable fallbacks.
- Prompt injection in user content and retrieved evidence cannot override system policy or tool permissions.
- Model outputs cannot silently trigger irreversible actions.

Do not equate a collection of prompt templates with a functioning agent architecture.

## J. Voice and language

Where voice integration is implemented, test:

- Each supported workflow.
- Speech recognition and transcription failures.
- Unsupported languages.
- Network and provider errors.
- Permission denial for microphone access.
- Cancellation and interruption.
- Confirmation before consequential actions.
- Server-side authorisation.
- Text alternatives for every essential voice workflow.

Verify Tamil and English support by examining and exercising the actual application. Do not claim complete translation based on a language toggle alone.

If external credentials are unavailable, distinguish code-level validation from end-to-end verification.

---

# 7. PHASE FOUR — SECURITY AUDIT

Perform a focused security review, not just a dependency scan.

## Authentication and authorisation

- Verify authentication boundaries.
- Verify role-based permissions on the server.
- Check object-level authorisation for every sensitive record.
- Attempt cross-user and cross-organisation access using controlled test accounts.
- Ensure frontend role checks are not the only protection.
- Test unauthenticated API requests.
- Test expired or invalid sessions.
- Check privileged service credentials.

## Database and RLS

- Review all tables and migrations.
- Inspect RLS policies and grants.
- Verify default-deny behaviour for sensitive tables where appropriate.
- Check read, insert, update, and delete policies independently.
- Test ownership and organisation boundaries.
- Verify anonymous-report access policies.
- Check whether privileged keys or service-role clients can be reached from the browser.
- Check that backend code does not accidentally bypass RLS without equivalent explicit authorisation.

## API and input handling

- Check schema validation and type coercion.
- Check injection risks.
- Check mass assignment and over-posting.
- Check rate limiting and abuse resistance where appropriate.
- Check file uploads and file access if supported.
- Check webhook authentication and replay protection.
- Check CORS and security headers.
- Check CSRF risks where relevant to the authentication architecture.
- Check unsafe URL fetching and server-side request forgery risks if URL retrieval exists.
- Check sensitive error messages and stack traces.

## AI-specific security

- Test prompt injection.
- Test requests for hidden data.
- Test unauthorised tool invocation.
- Test fabricated evidence.
- Test attempts to change roles through natural language.
- Test malicious or malformed model output.
- Ensure retrieved text is treated as untrusted input.
- Ensure the model cannot grant itself permissions.
- Ensure sensitive content is not sent to unnecessary external providers.
- Verify that logs exclude secrets and unnecessary personal information.

## Privacy and responsible behaviour

- Review data minimisation and retention assumptions.
- Check logging of personal information.
- Check whether safety or grievance data is overexposed.
- Verify that confidentiality claims match implementation.
- Check whether workers can understand what information is collected and shared.
- Check whether consequential recommendations have appropriate human oversight.

## Secrets and supply chain

- Inspect tracked files for exposed API keys, passwords, tokens, private credentials, and sensitive configuration.
- Review `.env` files, `.gitignore`, and example environment files.
- Inspect Git history for potentially committed secrets without reproducing their values.
- Check dependency vulnerabilities using available tooling.
- Identify unnecessary, abandoned, or suspicious dependencies.
- Review install and build scripts for unsafe behaviour.

If a secret was committed, do not merely remove it from the latest version. Report the exposure and recommend revocation and rotation. Never print the actual secret.

Do not run destructive security tests against live services.

---

# 8. PHASE FIVE — CODE QUALITY AND ARCHITECTURE

Review the repository for:

- Clear separation of concerns.
- Readable naming and consistent conventions.
- Type safety.
- Explicit domain models and validated boundaries.
- Reusable components and services.
- Duplicated business logic.
- Excessive component or function complexity.
- Unnecessary abstractions.
- Dead code and unused dependencies.
- Placeholder implementations.
- Unhandled errors.
- Incorrect asynchronous behaviour.
- Race conditions.
- Missing loading, empty, success, error, and offline states.
- Inconsistent state across pages.
- Unnecessary client-side code.
- Unbounded data retrieval.
- Missing pagination or filtering where scale requires it.
- Unnecessary database queries.
- Resource and event-listener leaks.
- Fragile configuration.
- Poorly documented assumptions.

Avoid refactoring working code solely to match personal stylistic preferences.

Prioritise correctness, maintainability, security, and clarity.

---

# 9. PHASE SIX — TESTING AND INDEPENDENT VERIFICATION

Inspect existing tests before adding new ones.

Run every applicable command discovered from the actual project configuration, including:

- Lint.
- Type checking.
- Unit tests.
- Integration tests.
- API and permission tests.
- Browser/end-to-end tests.
- Production build.
- Database migration validation.
- Container build and startup checks.
- Dependency and security checks.

Do not assume a command exists. Discover the actual scripts first.

## Required testing strategy

### Unit tests

Test deterministic business rules, wage calculations, fatigue rules, input validation, state transitions, permissions, and utility functions.

### Integration tests

Test database persistence, API boundaries, authentication, RLS, agent tools, case lifecycle, and failure handling.

### End-to-end tests

Exercise critical workflows through the actual interface.

At minimum, automate these journeys where the test environment permits:

1. Worker signs in and checks in.
2. Worker reviews attendance and wage information.
3. Worker reports an overtime discrepancy.
4. The system retrieves permitted evidence and calculates the expected wage result.
5. AI provides a grounded explanation or recommendation.
6. A persisted case becomes visible to an authorised employer.
7. Employer reviews the case and records an authorised action.
8. The action is audited and the worker sees the updated status.
9. Worker submits a safety concern and tracks the case.
10. Worker submits feedback using the supported privacy mode.
11. Employer cannot access records outside their permissions.
12. Both industries can complete their relevant workflows.
13. Simulation controls and event updates work.
14. The application remains functional when an external AI or voice provider fails.

Use isolated test data and clean up only test-created records.

### Negative and edge-case tests

Include:

- Invalid input.
- Missing records.
- Duplicate requests.
- Database failures.
- Provider timeouts.
- Unauthorised requests.
- Cross-organisation access attempts.
- Invalid case transitions.
- Concurrent updates.
- Stale data.
- Empty datasets.
- Large datasets.
- Mobile viewport behaviour.
- Language and keyboard-accessibility failures.

Report actual test counts, failures, skipped tests, and coverage only when supported by tool output.

Do not invent a universal coverage threshold. Focus on whether critical branches and high-risk behaviours are genuinely exercised.

---

# 10. PHASE SEVEN — ACCESSIBILITY AND USABILITY

Audit the application against practical accessibility expectations.

Verify:

- Semantic HTML.
- Correct heading hierarchy.
- Accessible names for controls.
- Keyboard navigation.
- Visible focus states.
- Appropriate focus management.
- Sufficient contrast.
- Text resizing and zoom.
- Form labels and understandable validation errors.
- Screen-reader-friendly status updates.
- Accessible dialogs and navigation.
- Reduced-motion support.
- Alternatives to colour-only indicators.
- Usable touch targets.
- Responsive layouts.
- Tamil/English language consistency.
- Text alternatives to voice interactions.
- Clear explanations of technical and financial information.
- Error recovery without losing user input where feasible.

Use automated accessibility tools where available, followed by manual checks.

Automated scans alone do not establish accessibility compliance.

Test realistic mobile-sized viewports. Verify that core workflows remain usable rather than simply checking whether the layout fits.

---

# 11. PHASE EIGHT — PERFORMANCE AND RELIABILITY

Investigate:

- Production build output.
- Bundle size and unnecessary dependencies.
- Slow or repeated database requests.
- Excessive data fetching.
- Missing pagination.
- Blocking network calls.
- Expensive rerenders.
- Unbounded polling.
- Realtime subscription cleanup.
- Duplicate simulation events.
- Memory and event-listener leaks.
- API timeouts.
- Retry storms.
- Missing request deduplication where needed.
- Graceful degradation.
- Long lists and large histories.
- Cold-start and container startup behaviour where measurable.

Do not optimise based on speculation alone. Identify the observed bottleneck, the risk, and the evidence for any claimed improvement.

Avoid introducing caching that could leak private data between users or organisations.

---

# 12. PHASE NINE — README AND DOCUMENTATION AUDIT

Review the README as if the evaluator has never seen the project.

It must clearly explain:

1. FairShift's purpose and chosen challenge vertical.
2. The real-world problem and intended users.
3. The industries and personas supported.
4. The approach and decision-making logic.
5. The architecture and data flow.
6. How the worker and employer workflows operate.
7. How the AI agents and deterministic rules interact.
8. How the simulation represents application activity.
9. How to install and run the project.
10. Environment variable names and setup instructions without actual secrets.
11. Database setup and migrations.
12. Test commands and verified test results.
13. Deployment procedure for Google Cloud Run.
14. Assumptions and limitations.
15. Which external integrations require credentials.
16. How demo data and deterministic fallbacks work.
17. Security and privacy considerations.

Keep every claim consistent with the code.

Verify that setup instructions work in a clean environment as far as available tools permit. Include a concise architecture diagram if it improves understanding.

Do not claim that tests pass, deployment succeeds, anonymity is guaranteed, or AI is live unless that claim has been verified.

---

# 13. PHASE TEN — GITHUB AND SUBMISSION COMPLIANCE

Treat these as hard gates.

## Repository visibility

Verify that the actual GitHub repository is public. A public URL that redirects to a login page or fails to expose the repository is not sufficient evidence.

## Branch count

Verify the actual branch count, including remote branches visible through GitHub where accessible. Ensure there is exactly one branch in the submitted repository.

Do not delete branches or rewrite history without understanding the consequences and obtaining approval when necessary.

## Repository size

Verify that the repository is strictly below 10 MB.

Inspect:

- Tracked source files.
- Large assets.
- Binary files.
- Generated build output.
- `node_modules`.
- Cache directories.
- Logs.
- Local databases.
- Screenshots and recordings.
- Test artifacts.
- Git history and Git objects.

Report both the working-tree/tracked-file footprint and Git repository storage size when feasible, explaining the measurement method. Check the actual GitHub repository size if the available API or interface provides it.

Do not assume that `.gitignore` removes files that are already tracked.

Do not blindly delete assets required by the application.

## Complete project code

Verify that all required application source, configuration, migrations, tests, and documentation are present. Exclude secrets and unnecessary generated artifacts.

## URL and submission materials

Verify:

- Correct public GitHub repository URL.
- Repository URL formatted with the required `.git` suffix for submission.
- Correct live Cloud Run URL.
- Correct public LinkedIn post URL.
- Consistency between deployed application, repository, README, and post.
- The Innovator Dashboard submission checklist is completed only after actual submission and confirmation.

Never invent a repository URL, deployment URL, LinkedIn URL, or dashboard confirmation.

---

# 14. PHASE ELEVEN — GOOGLE CLOUD RUN DEPLOYMENT VALIDATION

The official guide requires Cloud Run as the final deployment target.

Inspect the actual Dockerfile and deployment configuration.

Verify:

- The production application builds.
- The container starts successfully.
- The server listens on the port supplied through the `PORT` environment variable.
- The application binds to the expected network interface.
- Startup and health checks behave correctly.
- Runtime configuration is documented.
- Secrets are provided through appropriate server-side configuration.
- The application does not depend on local files that disappear between instances.
- Database connectivity and external integrations work from the deployed environment.
- CORS and authentication behave correctly in production.
- Logs do not expose credentials or sensitive information.
- A safe demo path exists when optional integrations are unavailable.
- The deployed URL serves the intended application.

If credentials and permissions are available, run a non-destructive deployment verification. Obtain approval before deploying, modifying live services, or incurring charges.

If deployment is unavailable, validate the container locally and mark the live Cloud Run URL as UNVERIFIED. Do not present a local URL as a deployed solution.

After any deployment, verify the actual live URL and run smoke tests against it.

---

# 15. PHASE TWELVE — SAFE REMEDIATION

After completing the initial audit:

1. Produce a prioritised defect list.
2. Fix all safely fixable P0 and P1 defects.
3. Fix P2 issues that materially affect evaluation.
4. Address P3 polish when time and stability permit.
5. Add regression tests for every important fix.
6. Avoid unrelated redesigns or speculative features.
7. Do not remove a feature merely because it is difficult to validate.
8. Do not fake an integration to make the application appear complete.
9. Do not weaken authentication, privacy, validation, or test assertions.
10. Preserve all working functionality.
11. Re-run the relevant checks after each fix.
12. Re-run the complete validation suite at the end.

If a fix requires unavailable credentials, external approvals, a destructive operation, or an architectural decision with significant trade-offs, explain the blocker and request the necessary input rather than guessing.

---

# 16. FINAL EVALUATOR SCORECARD

Create a final scorecard using these columns:

| Criterion | Priority | Status | Evidence | Remaining risk |
|---|---|---|---|---|

Include, at minimum:

- Mandatory repository rules.
- Complete source code.
- README compliance.
- Chosen vertical and persona.
- Smart assistant behaviour.
- Context-aware decision-making.
- Worker workflows.
- Employer workflows.
- Deterministic wage calculations.
- Safety and grievance workflows.
- Confidentiality and permissions.
- Both industry configurations.
- Interactive simulation.
- AI integration and fallback.
- Tamil/English accessibility.
- Voice integration or documented limitation.
- Code quality.
- Security.
- Efficiency.
- Testing.
- Accessibility.
- Problem statement alignment.
- Cloud Run deployment.
- Submission material consistency.

Do not assign an arbitrary numerical score and describe it as the official hackathon score.

If you provide an estimated readiness percentage, explicitly label it as your own evidence-based estimate, explain the method, and never allow a high average to hide a failed mandatory gate.

A mandatory failure cannot be offset by attractive design or extra features.

---

# 17. REQUIRED FINAL REPORT

At the end, produce the following report.

## A. Executive verdict

Choose exactly one:

- **READY FOR FINAL SUBMISSION** — All mandatory requirements and critical workflows are verified; no known critical defects remain.
- **CONDITIONALLY READY** — No known critical defect remains, but explicitly listed non-critical checks are unverified or incomplete.
- **NOT READY** — A mandatory rule, core workflow, critical security requirement, or other material evaluation requirement fails.

Do not use READY if a mandatory requirement is merely assumed.

## B. Mandatory gate results

Report actual results for:

- Public repository.
- Exactly one branch.
- Repository size below 10 MB.
- Complete code present.
- README requirements satisfied.
- Cloud Run live deployment verified.
- Submission links and materials ready.

## C. Findings

For each defect, provide:

- ID and severity.
- Affected file or component.
- Exact problem.
- Why it matters to the evaluator or user.
- Evidence.
- Fix applied, or reason it remains unresolved.
- Regression test or verification performed.

Do not dump secrets, personal data, or sensitive logs into the report.

## D. Test results

Report:

- Commands actually executed.
- Passed and failed tests.
- Skipped tests.
- Build and type-check results.
- Browser verification results.
- Security and accessibility scan results.
- Tests that could not be performed and why.

## E. Requirement coverage

Show every official criterion and intended core feature with a verified status.

## F. Remaining blockers

List every unverified external dependency, credential requirement, deployment limitation, repository issue, missing feature, or unresolved defect.

If nothing remains, state that only if the evidence supports it.

## G. Submission checklist

Provide a concise final checklist for:

- GitHub repository.
- Branch count.
- Repository size.
- README.
- Cloud Run URL.
- LinkedIn post.
- Innovator Dashboard.
- Final confirmation that submission was recorded.

Do not mark the final dashboard submission as complete until the actual confirmation has been observed.

## H. Final recommendation

Give one clear answer:

**Would you submit this exact version to a strict AI evaluator right now? Why or why not?**

Be direct and evidence-based.

---

# EXECUTION INSTRUCTION

Begin immediately with repository discovery and baseline verification.

Do not stop after generating a checklist or pointing out issues. Continue through the audit, execute the available tests, fix safely fixable defects, and verify the fixes.

Do not ask me to manually inspect files that you can inspect yourself.

Do not claim success without evidence.

If a mandatory check cannot be performed, continue auditing everything else and report the exact blocker.

**The objective is not to make FairShift look complete. The objective is to make FairShift demonstrably correct, secure, usable, maintainable, testable, aligned with the challenge, and compliant with every verifiable submission requirement.**