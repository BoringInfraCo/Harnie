# Sprint 001 — Pi Session Ground Truth  
**Status:** Complete — Conditional GO **Phase:** 0 — Feasibility **Type:** Research / evidence / fixture foundation  
## Objective  
Establish evidence-backed ground truth for how Pi persists real coding-agent sessions and determine the smallest Pi → Harnie normalization boundary required for Harnie’s feasibility path.  
This sprint does **not** implement the complete Pi adapter.  
It establishes the source evidence that future implementation will be built against.  
## Product hypothesis  
Harnie’s first feasibility path is:  
```
Pi
 ↓
Harnie Work State
 ↓
OpenCode

```
Before implementing that path, Harnie must prove that Pi persists enough structured information to recover meaningful coding work without relying on assumptions about Pi’s runtime.  
## Sprint question  
What information does a real Pi coding session persist, and which parts can Harnie reliably observe and normalize?  
   
⸻  
   
## Scope  
**1. Verify current Pi persistence behavior**  
Inspect current Pi documentation and, where useful, source code to establish:  
* session storage location  
* JSONL structure  
* session identity  
* entry identity  
* parent relationships  
* message representation  
* assistant output  
* tool calls  
* tool results  
* timestamps  
* model/provider changes  
* compaction  
* branching  
* extension/custom entries  
* workspace/cwd information  
* token/usage information where present  
Documentation claims must be distinguished from behavior observed in fixtures.  
**2. Inspect real local Pi sessions**  
Locate local Pi session storage without modifying it.  
Identify representative sessions that demonstrate actual coding work.  
Do not write to or migrate Pi’s session storage.  
**3. Produce sanitized fixtures**  
Create representative sanitized fixtures under:  
```
tests/fixtures/pi/

```
Target fixture classes:  
**A — Minimal**  
Simple user/assistant interaction.  
**B — Coding**  
Contains meaningful coding activity such as:  
* file reads  
* shell/tool execution  
* file modifications  
* tool results  
**C — Stateful work**  
Contains enough activity to observe:  
* goal  
* investigation  
* decisions or reasoning  
* completed work  
* unresolved work  
**D — Structural edge case**  
If available, capture a session demonstrating one or more of:  
* branch  
* compaction  
* model change  
* extension/custom entry  
Do not manufacture Fixture D solely to satisfy the sprint.  
**4. Document Pi source records**  
Produce an evidence-backed inventory of the source record types actually encountered.  
For each relevant record, document:  
* source type  
* meaningful fields  
* identity  
* relationships  
* ordering  
* whether Harnie needs it for Phase 0  
* whether information is observed directly or would require derivation  
**5. Define the first normalization mapping**  
Define, but do not fully implement, the smallest mapping required for future Pi normalization.  
Candidate Harnie events:  
```
message
tool_call
tool_result
command
file_read
file_write

```
Do not force Pi records into these categories if the evidence does not support the mapping.  
Unknown/unmapped source records must remain representable.  
**6. Validate Work State recoverability**  
Using the real fixture evidence, determine whether Pi provides enough information to recover or derive:  
* workspace  
* execution identity  
* chronological activity  
* messages  
* tool activity  
* relevant files  
* artifacts  
* goal  
* decisions  
* findings  
* unresolved work  
* next steps  
Classify each as:  
```
directly observed
derivable
not reliably available

```
   
⸻  
   
## Deliverables  
**Required**  
* representative sanitized Pi fixtures  
* Pi session format research notes  
* source-record inventory  
* proposed Pi → normalized-event mapping  
* Work State recoverability matrix  
* explicit unknowns and risks  
* recommendation for Sprint 002  
**Optional**  
Small read-only exploration scripts may be created if necessary to inspect Pi data.  
They are research utilities, not production adapter code.  
   
⸻  
   
## Provenance requirement  
Every claim about Pi persistence must identify its basis:  
```
documentation
source code
fixture evidence

```
Where sources disagree, fixture behavior should be recorded separately rather than silently reconciled.  
   
⸻  
   
## Security requirements  
The sprint must not commit:  
* API keys  
* access tokens  
* secrets  
* credentials  
* sensitive environment variables  
* unrelated private conversation content  
* personally identifying local paths where avoidable  
Fixtures must be sanitized while preserving structural fidelity.  
Original Pi session files must remain untouched.  
   
⸻  
   
## Explicit freezes  
Do **not** implement:  
* complete Pi adapter  
* SQLite Work Store  
* semantic derivation engine  
* OpenCode adapter  
* OpenCode handoff  
* model-based summarization  
* cloud storage  
* sync  
* daemon  
* MCP  
* native resume  
* agent execution  
* UI  
Do not broaden Sprint 001 because later architecture appears obvious.  
   
⸻  
   
## Decision criteria  
**GO**  
Proceed if real Pi session evidence contains enough structured information to support meaningful Harnie normalization and eventual semantic handoff.  
**CONDITIONAL GO**  
Proceed if important semantic state is not directly represented but can plausibly be derived from sufficiently rich source evidence with provenance.  
Record exactly what requires derivation.  
**NO-GO / rethink**  
Stop and reconsider the initial Pi wedge if real sessions do not preserve enough reliable information to reconstruct meaningful work without essentially replaying or forwarding the entire transcript.  
   
⸻  
   
## Definition of Done  
Sprint 001 is complete when:  
* current Pi persistence behavior has been researched  
* local Pi session storage has been inspected read-only  
* representative real session fixtures exist and are sanitized  
* encountered source record types are documented  
* identity/ordering/parent semantics are understood  
* candidate normalization mapping is documented  
* unknown/unmapped records are accounted for  
* Work State recoverability matrix is complete  
* security review confirms fixtures contain no secrets/private material  
* GO / CONDITIONAL GO / NO-GO decision is recorded  
* Sprint 002 recommendation follows from evidence  
## Sprint north star  
Understand Pi’s persisted reality before Harnie invents an abstraction for it.  
