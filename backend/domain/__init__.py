"""CaseScribe domain data — the proprietary moat.

Embeds (verbatim from the ``casescribe-domain`` skill):

* ``cpt_table``      — the school-Medicaid CPT/HCPCS code table + unit semantics.
* ``reporter_rules`` — California CANRA categories, the critical non-triggers,
  and the belt-and-suspenders regex keyword net.

The sub-agents SELECT from this data; they never invent codes or legal
conclusions.
"""
