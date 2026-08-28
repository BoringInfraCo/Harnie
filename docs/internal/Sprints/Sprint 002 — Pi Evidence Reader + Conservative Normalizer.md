## Sprint 002 — Pi Evidence Reader + Conservative Normalizer  
**Status:** Planned **Phase:** 0 — Feasibility **Type:** Implementation / evidence validation **Depends on:** Sprint 001 — CONDITIONAL GO  
## Objective  
Build Harnie’s first production-quality source boundary: a read-only, raw-preserving Pi v3 evidence reader and conservative normalizer.  
Then close Sprint 001’s outstanding local-evidence condition using real local Pi coding sessions.  
This sprint establishes Harnie’s distinction between:  
```
what the harness persisted
        ↓
what Harnie can safely observe
        ↓
what Harnie may later derive

```
Sprint 002 implements only the first two layers.  
It does not reconstruct semantic Work State.  
   
⸻  
   
## Background  
Sprint 001 established that current Pi v3 session data contains sufficient structured evidence for Harnie’s feasibility path, but returned **CONDITIONAL GO** because no local Pi sessions were found in the inspected locations.  
Sprint 001 also corrected several initial assumptions:  
1. Physical JSONL order represents append chronology.  
2. Logical conversation structure follows parentId.  
3. Tool calls exist as assistant content blocks rather than top-level records.  
4. Tool results correlate through toolCallId.  
5. Tool names do not establish tool semantics because Pi extensions may override built-in names.  
6. Pi loaders may mutate source evidence through repair or migration.  
7. Pi v3 and emerging v4 representations must be distinguished.  
8. Unknown records must remain preservable rather than forced into Harnie’s known event taxonomy.  
Sprint 002 must encode these findings into implementation.  
   
⸻  
   
## Sprint question  
Can Harnie safely read real Pi evidence, preserve its original structure and provenance, diagnose structural problems, and normalize only the semantics supported by that evidence?  
   
⸻  
   
## Scope  
## 1. Establish the minimal implementation foundation  
Create only the project/runtime scaffolding required to implement and test this sprint.  
Recommended stack remains:  
* TypeScript  
* Node.js  
* runtime schema validation  
* Vitest or similarly lightweight test runner  
Do not create the full architecture described in IMPLEMENTATION.md.  
Only create modules required by Sprint 002.  
   
⸻  
   
## 2. Define Source Record  
Introduce Harnie’s raw evidence envelope.  
Conceptually:  
```
SourceRecord
├── source
│   ├── harness
│   ├── session_id
│   ├── format
│   ├── source_path?
│   └── imported_at?
│
├── identity
│   ├── entry_id?
│   ├── line
│   └── parent_id?
│
├── chronology
│   └── timestamp?
│
├── raw
│   └── original payload
│
└── diagnostics[]

```
Exact TypeScript representation may differ if implementation evidence warrants it.  
Requirements:  
* preserve the parsed source payload losslessly;  
* preserve physical line identity;  
* preserve source session identity;  
* preserve parentId independently of physical ordering;  
* preserve unknown record types;  
* avoid assigning semantics not present in the source evidence.  
Source path must not become part of portable Work identity.  
   
⸻  
   
## 3. Represent source format independently  
Pi harness identity and Pi session format identity must be separate concepts.  
Conceptually:  
```
harness
  pi

source_format
  pi-session-v3

```
Do not infer an exact Pi emitter version unless the source evidence provides it.  
The implementation should distinguish:  
* recognized v3 session family;  
* recognized/emerging v4 family when detectable;  
* unsupported/unknown format.  
Sprint 002 does not need to support normalization of v4.  
Detection is sufficient.  
   
⸻  
   
## 4. Implement raw Pi reader  
Implement a Pi reader that uses generic read-only filesystem/stream operations.  
It must not use Pi’s SessionManager or another Pi loader against original session files.  
Pipeline:  
```
Pi JSONL
   ↓
generic read-only I/O
   ↓
line parser
   ↓
SourceRecord[]

```
Requirements:  
* never mutate the source;  
* never repair malformed source silently;  
* never migrate source;  
* preserve physical line order;  
* report malformed lines;  
* preserve valid records surrounding malformed records where safe.  
   
⸻  
   
## 5. Implement format detection  
Detect Pi session family using source evidence.  
At minimum:  
```
pi-session-v3
pi-session-v4
unknown

```
If Sprint 001 research shows a more accurate naming scheme, use the evidence-backed terminology.  
Detection must not depend solely on installed Pi package version.  
Tests should cover:  
* known v3 fixture;  
* known v4/header evidence if available;  
* malformed/unknown header.  
   
⸻  
   
## 6. Validate record identity  
For v3 records, inspect and validate where applicable:  
* session header  
* session ID  
* entry ID  
* parent ID  
* timestamp  
* record type  
Diagnostics should be emitted for:  
* missing required identity;  
* duplicate entry IDs;  
* malformed timestamps;  
* malformed record structures.  
Do not rewrite invalid identity.  
   
⸻  
   
## 7. Preserve both ordering models  
Harnie must preserve:  
## Physical order  
The order records appear in JSONL.  
## Parent graph  
Relationships expressed through parentId.  
These must remain independent.  
Do not rewrite the source into a single canonical conversational order during ingestion.  
Provide enough structure for later layers to reconstruct a branch path without losing append chronology.  
   
⸻  
   
## 8. Parent graph diagnostics  
Detect structural issues including:  
* orphan parent references;  
* duplicate IDs;  
* impossible/self-parent relationships;  
* cycles if encountered;  
* malformed parent IDs.  
Diagnostics should not automatically make all otherwise-readable evidence unusable.  
Prefer partial truth.  
   
⸻  
   
## 9. Tool correlation  
Recognize Pi assistant toolCall content blocks and toolResult messages.  
Correlate using:  
```
toolCallId

```
Do not use parentId as the tool-result correlation mechanism.  
Diagnostics should cover:  
* tool call without result;  
* result without known call;  
* duplicate result correlation;  
* ambiguous correlation where applicable.  
An unfinished local session may legitimately contain a call without a completed result. Represent this rather than repairing it.  
   
⸻  
   
## 10. Define Normalized Event  
Introduce the smallest Harnie-normalized event representation necessary for Sprint 002.  
Conceptually:  
```
NormalizedEvent
├── id
├── source_record
├── kind
├── timestamp?
├── payload
├── provenance
└── diagnostics[]

```
Initial event kinds:  
```
message
tool_call
tool_result
command
unknown

```
Do not add additional semantic kinds without evidence.  
   
⸻  
   
## 11. Conservative message normalization  
Normalize directly observed:  
* user content;  
* assistant content;  
* tool-result messages.  
Preserve relevant structured content.  
Thinking/reasoning blocks must not be accidentally converted into user-visible assistant text.  
If preserved, they must remain distinguishable from ordinary text.  
   
⸻  
   
## 12. Conservative tool normalization  
Assistant tool-call blocks normalize to:  
```
tool_call

```
Tool name must remain metadata.  
For example:  
```
name: "read"

```
does not become:  
```
file_read

```
without independent semantic evidence.  
Likewise:  
```
bash
edit
write
read

```
remain generic tool calls in Pi v3 when tool origin cannot be established.  
   
⸻  
   
## 13. Direct command normalization  
A direct source record such as Pi bashExecution, where the source format itself establishes command semantics, may normalize to:  
```
command

```
This distinction must be tested.  
Do not infer command solely from a tool named bash.  
   
⸻  
   
## 14. Unknown preservation  
Any valid Pi record Harnie does not understand must remain representable.  
Example:  
```
kind: unknown
source_type: custom_future_record
raw: {...}

```
Unknown does not mean invalid.  
Unknown records must retain provenance and source payload.  
This is required for forward compatibility.  
   
⸻  
   
## 15. Provenance  
Every normalized event must be traceable to its source evidence.  
At minimum provenance should allow Harnie to identify:  
```
harness
source format
source session
source entry
physical line
source record type

```
For nested records such as tool calls inside assistant message content, provenance must identify the containing source record and, if necessary, the nested location.  
Harnie should be able to answer:  
Which exact Pi evidence caused this normalized event to exist?  
   
⸻  
   
## 16. Diagnostics  
Diagnostics are first-class output.  
Suggested shape:  
```
Diagnostic
├── code
├── severity
├── message
├── source
└── details?

```
Initial severities may be:  
```
info
warning
error

```
Avoid excessive diagnostic taxonomy.  
Required diagnostic classes include:  
* malformed JSONL;  
* invalid header;  
* unsupported source format;  
* duplicate entry;  
* orphan parent;  
* invalid parent relationship;  
* malformed timestamp;  
* orphan tool result;  
* missing tool result where determinable;  
* unknown record type.  
   
⸻  
   
## 17. Local evidence validation  
Sprint 001’s CONDITIONAL GO must be explicitly addressed.  
Capture at least:  
## Local Trace A — Coding  
A real locally produced Pi session involving meaningful coding activity such as:  
* inspecting a repository;  
* reading files;  
* executing tools/commands;  
* making at least one code change;  
* running a verification step.  
## Local Trace B — Unfinished / Stateful  
A real locally produced Pi session involving:  
* a meaningful goal;  
* investigation;  
* multiple relevant context interactions;  
* at least one meaningful choice or discovered constraint;  
* partial progress;  
* deliberately stopping before the work is complete.  
The second trace is particularly important because Harnie’s feasibility hypothesis depends on continuing unfinished work.  
   
⸻  
   
## 18. Local fixture handling  
Local sessions must remain untouched.  
Create sanitized derivatives for committed fixtures only if they can be sanitized without destroying structural fidelity.  
Record fixture provenance clearly:  
```
source class
capture method
sanitization performed
structural transformations
known limitations

```
Do not claim a sanitized derivative is byte-identical to the original.  
Never commit original private sessions.  
   
⸻  
   
## 19. Compare public and local evidence  
Compare the local traces against Sprint 001’s maintainer-published traces.  
Determine whether the existing assumptions remain valid for locally emitted sessions.  
Explicitly check:  
* header family;  
* entry types;  
* ID structure;  
* parentId;  
* tool-call representation;  
* tool-result correlation;  
* model changes;  
* timestamps;  
* unexpected records;  
* any schema differences.  
Record discrepancies.  
   
⸻  
   
## 20. Test coverage  
Add automated tests for:  
## Reader  
* valid JSONL;  
* malformed line;  
* empty line behavior;  
* source preservation;  
* physical line identity.  
## Format detection  
* v3;  
* v4 if evidence exists;  
* unknown.  
## Graph  
* valid parent graph;  
* orphan;  
* duplicate ID;  
* self-parent;  
* cycle.  
## Tool correlation  
* matched call/result;  
* missing result;  
* orphan result;  
* duplicate correlation.  
## Normalization  
* user message;  
* assistant message;  
* tool call;  
* tool result;  
* direct command;  
* unknown record.  
## Provenance  
Every normalized event maps back to its exact source evidence.  
   
⸻  
   
## 21. Required deliverables  
Sprint 002 must produce:  
* minimal Harnie implementation/tooling foundation;  
* SourceRecord representation;  
* Pi source-family detection;  
* read-only Pi v3 reader;  
* structural diagnostics;  
* conservative normalizer;  
* NormalizedEvent representation;  
* provenance representation;  
* automated tests;  
* sanitized local fixture(s) where safe;  
* local-vs-public evidence comparison;  
* updated Pi research notes where Sprint 002 evidence changes Sprint 001 conclusions;  
* Sprint 002 outcome report;  
* evidence-backed Sprint 003 recommendation.  
   
⸻  
   
## 22. Explicit freezes  
Do **not** implement:  
* SQLite Work Store;  
* Work persistence;  
* full Work domain model;  
* Work reconstruction;  
* goal derivation;  
* Decision objects;  
* Finding objects;  
* Artifact derivation;  
* NextStep derivation;  
* model-assisted semantic derivation;  
* OpenCode adapter;  
* OpenCode handoff;  
* native resume;  
* cloud persistence;  
* sync;  
* daemon;  
* MCP;  
* agent execution;  
* UI.  
Do not implement file_read or file_write classification merely because a Pi tool is named read, write, or edit.  
Do not use Pi’s loader to repair or migrate original evidence.  
   
⸻  
   
## 23. Decision criteria  
## GO  
Proceed when:  
* Harnie can safely read real local Pi v3 sessions;  
* raw evidence remains preserved;  
* chronology and graph structure remain intact;  
* tool calls/results correlate conservatively;  
* unknowns survive ingestion;  
* normalized events retain exact provenance;  
* local evidence materially agrees with the Sprint 001 model;  
* the local coding and unfinished traces demonstrate sufficient evidence for later Work reconstruction.  
## CONDITIONAL GO  
Proceed only with explicit conditions if local evidence introduces bounded schema/semantic gaps that do not invalidate the feasibility path.  
Conditions must identify exactly what later work must prove.  
## NO-GO / rethink  
Stop and reconsider the Pi feasibility path if:  
* locally emitted Pi evidence materially differs from the researched format in ways Harnie cannot safely ingest;  
* meaningful coding activity cannot be preserved without using Pi’s mutating loader;  
* provenance cannot survive normalization;  
* source ambiguity requires Harnie to invent semantics at the ingestion boundary;  
* unfinished work lacks enough evidence to support future reconstruction.  
   
⸻  
   
## 24. Definition of Done  
Sprint 002 is complete when:  
* minimal TypeScript/test foundation exists;  
* SourceRecord is implemented;  
* Pi source-format family is detected independently of installed harness version;  
* Pi v3 JSONL is read using generic read-only I/O;  
* physical line order is preserved;  
* parent graph structure is preserved;  
* malformed/orphan/duplicate/cycle diagnostics exist;  
* tool calls/results correlate through toolCallId;  
* conservative NormalizedEvent representation exists;  
* generic tool names remain generic;  
* direct command semantics are normalized only where directly evidenced;  
* unknown records remain losslessly representable;  
* normalized events retain exact provenance;  
* automated tests cover reader, graph, correlation, normalization, unknowns, and provenance;  
* one real local coding trace has been inspected;  
* one real local unfinished/stateful trace has been inspected;  
* local traces have been compared against Sprint 001 public evidence;  
* committed local fixtures, if any, are sanitized and provenance-documented;  
* security/privacy scans pass;  
* GO / CONDITIONAL GO / NO-GO decision is recorded;  
* Sprint 003 recommendation follows from evidence.  
   
⸻  
   
## 25. Sprint north star  
Preserve what Pi actually said before Harnie decides what the work means.  
