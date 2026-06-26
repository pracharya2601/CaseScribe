"""CaseScribe sub-agents.

Four single-responsibility agents, each calling ``gmi.complete(step, ...)`` with
the right model tier and temperature:

* ``classifier`` — cheap/fast triage; runs first, feeds the others.
* ``reporter``   — mid, T=0; LLM judgment ∪ regex net; CANRA correctness;
                   Tier-2 frontier escalation hook behind a flag.
* ``medicaid``   — code-strong; selects from the embedded table; enforced unit
                   math + reimbursement.
* ``casenote``   — frontier; SOAP/GIRP note, consistent with the reporter flag.

Each agent validates the model's JSON against its Trinity sub-shape, retries
once on malformed output, and degrades gracefully (never raises into the
pipeline).
"""
