# The authoring prompt

*Contribution 1, written for a teacher rather than for an agent.*
`decomposition.md` is the full decomposition model, and it is what an agent
should be given. This file is the short version a teacher can paste into any
AI chat without reading anything first — the entry step, not a replacement.

Version 1.0.0.

Everything below the line is meant to be copied as-is.

---

I am a teacher, and I want to build a **skill tree** for my subject: a graph of
the skills and concepts in the subject, where each node says what it means to
master that one thing, and names which other nodes have to come first. Students
use it to see the whole structure, tick off what they have mastered, and copy an
AI instruction for whatever they want to practise next.

Help me build one. Work through this in order, and ask me one thing at a time.

**1. Ask me about the subject first.** What subject and level, which country and
curriculum, roughly how many hours of teaching it covers, and what my students
usually find hardest. Ask what language the tree should be written in — it will
be written in one language and stay in it. Do not start listing nodes until I
have answered.

**2. Then propose the topics**, six to twelve of them, and let me correct them
before you go further. These become the columns of the tree.

**3. Then decompose each topic into nodes.** A node is one thing a student can
be said to master, small enough to practise in a sitting. Two kinds:

- `skill` — something the student *does*. "Solve a linear equation."
- `concept` — something the student *understands*. "What a variable is."

For each node, write a description that says **what mastering it means**, in one
or two sentences, addressed to no one in particular ("The student can …"). Not a
lesson plan, not a list of tasks — the test of whether someone has it.

**4. The prerequisites are the real work, and they are what most attempts get
wrong.** For every node, ask: what must a student already be able to do before
this one makes any sense? List those nodes, and only those — not everything that
is vaguely related, and not the whole preceding topic. Prerequisites cross
topics freely, and they should: that crossing is most of what makes the tree
worth drawing. A tree where almost every node has no prerequisites is a list
with columns, not a skill tree, and it is the most common way this goes wrong.

**5. Give it back to me as a CSV file** with exactly these columns:

```
id,type,topic,name,description,depends_on,aids,instruction
```

- `id` — short, lowercase, hyphenated, unique. Referenced by other rows.
- `type` — `skill` or `concept`. These two words in English, whatever language
  the tree is in.
- `topic` — the column it belongs to, written out in full, spelled identically
  on every row of that topic.
- `name` — what a student sees. Short.
- `description` — what mastering it means.
- `depends_on` — other `id`s, separated by semicolons. Empty for a starting
  node.
- `aids` — leave as `0` unless I have told you about exam rules.
- `instruction` — usually empty. Use it only where practising this node needs
  advice the general instruction would not give.

**At the top of the file, before any node, put the configuration rows.** Same
columns, with `config` in the `type` column, the setting's name in the `name`
column and its value in the `description` column:

```
,config,,schemaVersion,3,,,
,config,,title,<what the tree is called>,,,
,config,,language,<language code: en, nb, sv, de …>,,,
,config,,subjectFamily,<mathematics, natural-sciences or social-sciences>,,,
,config,,features.motivation,true,,,
,config,,slots.courseName,<the course as it should be named to a student>,,,
,config,,slots.motivationSubject,<the subject in one everyday word>,,,
,config,,slots.expressionFocus,<what students in this subject habitually get sloppy about in how they write>,,,
```

Do not add settings that are not on this list — an unknown setting is reported
as an error rather than quietly ignored.

**6. Check your own work before you hand it over**, and tell me what you found:

- Does every `depends_on` point at an `id` that exists in the file?
- Is there any cycle — a node that, through its prerequisites, depends on
  itself?
- How many nodes have no prerequisites at all? If that is more than about a
  third of them, go back to step 4: you have probably not done the work.
- Is every `topic` spelled the same way everywhere?

**7. Tell me what you are unsure about.** Which nodes you had to guess at,
where you suspect the curriculum says something you do not know, and which
prerequisites you are least confident in. I would rather have the list than a
confident file.

Then I will open the file at **aiskilltrees.com/make-your-own/**, which draws
the tree, checks it again, and gives me back a single HTML file I can hand to
my students.
