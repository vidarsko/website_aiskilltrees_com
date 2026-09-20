# The decomposition model

**Version 1.2.0** · source language: English · Contribution 1 of the AI Skill Trees method.

This is the specification for turning a curriculum into a skill tree. It is written to be
handed to an AI agent together with the curriculum document for one subject, or with a topic
list where that document may not be shared (section 7); the agent produces a first
decomposition, and a teacher then revises it. It is also readable on its own
by a teacher who wants to do the work by hand.

The output is one CSV file, `nodes.csv`, plus a short subject note. Nothing else. The engine
derives everything it draws from that file, so a subject is authored by editing learning
outcomes and their dependencies — which is the didactic question — and never by arranging
boxes.

This document is the single master file for the data model and the decomposition rules,
**regardless of the subject's language**. Norwegian, Swedish and English trees all follow the
schema and the rules below. Never write a parallel copy of this document for another language.
What is specific to one *family* of subjects lives in `prompts/subjects/<family>.json`, under
that file's `decomposition` key; what is specific to *one* subject lives in that subject's own
note.

Update the version number above whenever the rules for decomposing change, so that it is
possible to tell whether a given subject's `nodes.csv` was built under an older version and may
need revising.

---

## 1. Before you start: know who takes the subject

You cannot apply the central rule in section 4 without knowing who is in the room. Before
decomposing anything, write down — and keep, as the subject's note:

- whether the subject is **compulsory or elective**;
- **where in the sequence** it sits, relative to where its vocabulary is first taught;
- how **self-selected** the cohort is, and how strong the intake typically is.

A compulsory subject enrols students with the full spread of prior knowledge. An elective late
in a sequence enrols students who have already passed a chain of prerequisite subjects. These
two cases produce genuinely different trees from the same curriculum, and the difference is not
a matter of taste.

Also identify the subject's **family** — `mathematics`, `natural-sciences`, `social-sciences`
— and read the `decomposition` block of `prompts/subjects/<family>.json` before going further.
It carries the rules that hold for that family and not for the others, including which verbs to
name skills with.

---

## 2. What a node is

Every node carries a **type**.

A **concept** is declarative knowledge: a definition, a named quantity, a rule stated in words.
A **skill** is a procedure or a higher-order capability, written as a learning outcome
describing what the student does.

The distinction does work beyond labelling. **When a concept would require extensive work
before anyone would say a student had practised it, that work does not belong in the concept
node.** It becomes a separate skill node that lists the concept among its prerequisites. The
concept node then tests understanding — explain it in your own words, decide whether a
borderline case falls under it, distinguish it from something it resembles. The skill node
trains execution.

The naming convention makes the type visible:

- a **concept** node takes a **noun phrase** as its name — just the concept itself, not a
  paraphrase. Write "Power", not "The concept of a power".
- a **skill** node takes a **verb phrase** describing what the student does — "Draw a table and
  a graph for a function".

The type should therefore be recognisable from the shape of the name alone. **A skill node with
a noun for a name is a signal that the node needs reconsidering**, and so is a concept node
named with a verb.

Which verbs to reach for depends on the family. See `prompts/subjects/<family>.json` →
`decomposition.skillVerbs`; in the more qualitative subjects this is where the SOLO taxonomy
comes in, and it materially changes what the upper half of the tree looks like.

---

## 3. The data model

One row per node in `nodes.csv`. The schema is shared by every subject in every language; only
the values are in the subject's own language.

| Column | Type | What it is |
|---|---|---|
| `id` | text, unique | Short, URL-friendly identifier, kebab-case. Used as a foreign key elsewhere. E.g. `percentage-growth-factor` |
| `type` | `skill` \| `concept` | See section 2. **The value is an English data enum in every language**, including in a Norwegian or Swedish file. Only the displayed label is translated. |
| `topic` | text | Subject area used for visual grouping, e.g. "Statistics". Decides which column the node is drawn in. Purely visual — it does not affect dependencies. An empty value lands in a catch-all column with a console warning. |
| `name` | text | Short display name in the box. See the naming convention in section 2. |
| `description` | text | The full learning outcome ("The student can …") or definition. **This is the goal of the session, not something the student already knows** — write it as what the student cannot yet do. |
| `depends_on` | semicolon-separated `id`s | Which nodes must be mastered first. Empty for root nodes. **This field alone determines the layout**; there is no manual positioning anywhere. |
| `aids` | subject-defined | The assessment context in which mastery is to be demonstrated. See section 6. Optional. |
| `instruction` | text | Node-specific addition to the AI instruction. **Not the whole instruction** — only what is unique to this node. Usually empty. |

`depends_on` must describe a **directed acyclic graph**. The engine validates this at load time
and names the nodes involved in any cycle it finds.

Several fields can contain commas, so quote them properly. Do not store composed AI instruction
text in the CSV — it is generated.

### Example rows

```csv
id,type,topic,name,description,depends_on,aids,instruction
fraction-decimal,concept,Percentages,Fractions and decimals,The student knows the relationship between fractions and decimals and can convert between the two forms.,,1,
percentage,concept,Percentages,Percentage,The student can explain what a percentage means and convert between percentages and decimals.,fraction-decimal,1,
growth-factor,skill,Percentages,Calculate the growth factor from a percentage,The student can calculate the growth factor given a percentage change (increase or decrease).,fraction-decimal;percentage,1,"Focus on the bare calculation: given a percentage, find the growth factor. No context or interpretation required."
```

---

## 4. Which concepts earn a node

This is the substantive rule, and the part of the method that transfers.

**The criterion is whether a concept is load-bearing: a concept earns a node only if something
further down the tree breaks when a student does not understand that word in its technical
sense.**

Ordinary language gets no node. That includes ordinary words used in a subject context without
acquiring a specialised meaning. The technical sense a word acquires in the subject *does* get
one — which is why "average speed" earns a node where the everyday word "speed" does not.

Without this rule the map fills with trivial nodes and stops being readable.

### The threshold moves with the subject, not only with the word

Whether a load-bearing word also deserves a node *in this subject* is not settled by how hard
the word is. It is settled by how safely you can assume the whole cohort already has it
automatic. Two things move the threshold:

1. **Where the subject sits in the sequence.** The closer it is to where the word is first
   taught, the lower the threshold.
2. **How self-selected the cohort is.** A compulsory subject: low threshold, decompose
   generously. An elective late in a sequence: high threshold, and a node is justified only for
   what is genuinely new *in this subject*, not for reintroductions of earlier vocabulary.

The word *coordinate system* shows the range. It belongs as a node in lower-secondary
mathematics, where students meet it formally for the first time and the cohort is everyone. It
is a judgement call in a general upper-secondary subject. It does not belong in an advanced
elective, where students have chosen a demanding subject and should hold it already.

This is why section 1 comes first.

### In practice

Go through the curriculum's competence aims and identify explicitly which subject terms are a
prerequisite for understanding later nodes. Make sure each of those has its own concept node —
**even where many will turn out to be already familiar to most students at that level**. That
is not a problem: it just means the student gets to tick them off quickly, and the map stays
honest about what the later nodes rest on.

---

## 5. Dependencies

The dependency list is not only an ordering. It is also the **vocabulary boundary** the AI
instruction is built on: the generated instruction tells the model it may use the words from a
node's prerequisite list freely, because the student has met them, and that any term appearing
for the first time in this node's own name or description is new and must be explained at first
use. A missing dependency therefore does not just misplace a box — it lets the model pitch an
explanation above the student.

Two failure modes to check for deliberately, because they are the common ones:

- **Dependencies that cross topics are under-generated.** Within a topic they are obvious; a
  statistics node that rests on a fractions node is the kind that gets missed, and it is exactly
  the kind that makes the graph worth more than a list of topics.
- **Nodes acquire dependencies they do not need.** A dependency means *this genuinely cannot be
  done first*, not *this is usually taught first*. Prune anything that is merely conventional
  ordering; it costs the student a false prerequisite.

---

## 6. The assessment-context field (`aids`)

One field records the conditions under which mastery is to be demonstrated. Norwegian
mathematics examinations separate a part written without aids from a part written with them,
and IB Mathematics separates Paper 1 from Paper 2 on the same principle.

The field belongs to the **assessment context, not to the skill** — the skill is the same
either way. It is **optional**: a subject declares its default in its configuration, and a node
carries a value only when it departs from that default. A subject in a system that draws no such
distinction sets one default and never touches the field again. A subject with no written
central examination turns the field off entirely.

The prose explaining what each level actually permits is the subject's own, and lives in its
configuration — not in this specification and not in the CSV.

---

## 7. Working with an agent

A teacher does not write 100 nodes by hand. Hand this specification to an agent together with
the curriculum — or, where you may not share the curriculum, with your own list of the
subject's topics — and revise what comes back.

**Settle what you are permitted to do with the source document before any of it goes to a
model.** Curriculum texts differ in status from one country to the next. In Norway and Sweden
a curriculum is adopted as a regulation and carries no copyright at all, so the document can
be shared freely. A syllabus published by a private examination body is that body's property,
and where a school holds a licence to reproduce it, the licence is usually the school's rather
than yours personally. Handing a document to a third-party model is an act of copying in its
own right, separate from anything you publish afterwards, so it is the question to answer
first — and it arises even for a tree you only ever intend to keep to yourself. Where you may
not share the document, read it yourself and hand the agent the topic list instead: the
specification is what the agent needs, and the source text is not.

The division of labour is consistent, and worth knowing in advance:

**The agent is reliable at** enumerating outcomes from a curriculum or a topic list, proposing
dependencies within a topic, and keeping to the CSV schema and the naming conventions.

**The teacher's judgement is required for** the load-bearing decision, since the agent tends to
produce a node for every technical term it meets; for the cohort-dependent threshold, which the
agent cannot infer without being told who takes the subject; and for dependencies that cross
topics, which the agent under-generates.

Treat a first pass as a draft to cut down, not a draft to extend.

---

## 8. Source material and copyright

**Decompose into your own formulations. Do not copy curriculum text, textbook prose or
examination questions verbatim into a `nodes.csv`.**

**What the copyright question turns on is what you do with the finished tree.** A tree you build
for your own teaching and keep to yourself is a different act from one you publish, and most
teachers are in the first case: the artifact is for their own classroom and never goes near a
catalogue. Decide which case you are in before you start, because it decides which of the two
reasons below applies to you. What it does not change is section 7 — handing a source document
to a model is copying whether or not anything is published afterwards.

1. **Licensing — this applies only if the tree is to be published.** The CSV files published
   with this method are released under an open licence. Text you do not hold the rights to
   cannot be relicensed by putting it in one. Whether the curriculum itself is copyrighted
   varies by country — in Norway and Sweden it is a regulation and is not — but textbooks and
   published examination papers are copyrighted almost everywhere, including where the
   curriculum is not. A tree that stays with you is not a publication, and this reason does not
   reach it: a paragraph of a textbook sitting in a file on your own machine is the same kind
   of act as writing it into your own lecture notes.
2. **It is the wrong output anyway — this applies either way.** A node's `description` is a
   learning outcome written for *this* tree at *this* level for *this* cohort. Curriculum text
   is written for a different purpose and at a different grain, and pasting it in produces
   worse nodes, not faster ones. This is the reason the rule above is stated for everybody and
   not only for the subjects headed for publication.

**A private tree can become a published one.** If there is any prospect of that, work as though
reason 1 already applied: retrofitting your own formulations onto a finished tree means going
through every node again, which is far more work than writing them that way once.

Using copyrighted material as **background** to work out what a subject requires is a different
act from reproducing it, and is the normal way this work is done. Where a subject was built
that way, **say so in that subject's note** — name what was consulted, and record that no
source text or problem numbers were reproduced. This is worth doing for a private tree too: the
note costs nothing while you still remember what you read, and it is what lets the subject be
published later without an audit. Do not conceal a source, and never instruct an agent to
conceal one.

---

## 9. Checklist for a new subject

1. Write the subject note first: cohort, position in the sequence, self-selection, family
   (section 1), and whether the tree is for your own teaching or for publication (section 8).
2. Read `prompts/subjects/<family>.json` → `decomposition`.
3. Go through the curriculum and list the competence aims. Check what you may do with the
   document before handing any of it to an agent (section 7).
4. Identify the load-bearing concepts (section 4) against the threshold from step 1.
5. Split any concept that carries extensive procedural work into a concept node plus a skill
   node (section 2).
6. Write `nodes.csv` to the schema in section 3.
7. Add the dependencies, then make a second pass specifically for the cross-topic ones
   (section 5).
8. Set the subject's `aids` default, or turn the field off (section 6).
9. Record in the subject's note which version of this document the decomposition was made
   against, and what source material was consulted (section 8).
