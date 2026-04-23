// One-off: rewrite the Innergy FSL instrument content to match
// FSL_Diagnostic_corrected.docx (1).pdf exactly. Updates in place on the
// currently-published version. Past Result rows are untouched (immutable).
//
// Run with: npx tsx src/db/update-fsl-v2.ts

import { prisma } from "./client";

type Opt = { label: "A" | "B" | "C" | "D"; text: string; score: number };
type Q = { n: number; stem: string; options: Opt[] };

// ---- Section A: Section 1 (8 questions, max 38) ----
const COGNITIVE: Q[] = [
  {
    n: 1,
    stem: "When I have to make an important decision but don't have all the information I need, I typically:",
    options: [
      { label: "A", text: "Wait to see if more information emerges before committing", score: 2 },
      { label: "B", text: "Actively find more data to see the full picture", score: 4 },
      { label: "C", text: "Involve the team, ask others, or escalate upward", score: 2 },
      { label: "D", text: "Push forward with what I know and adjust as I go", score: 5 },
    ],
  },
  {
    n: 2,
    stem: "When something urgent lands on my desk - a complaint, a request, a crisis - my first instinct is to:",
    options: [
      { label: "A", text: "Take control and deal with it immediately so it is off my plate", score: 2 },
      { label: "B", text: "Figure out how and why this situation occurred in the first place", score: 1 },
      { label: "C", text: "Delegate it and check back later", score: 3 },
      { label: "D", text: "Pause and assess whether it really needs my attention, then decide what to do", score: 5 },
    ],
  },
  {
    n: 3,
    stem: "When a decision I made stops producing the results I expected, what below is most representative of you?",
    options: [
      { label: "A", text: "I find it hard to tell the team the approach is not working, but eventually I do", score: 4 },
      { label: "B", text: "It is difficult to figure out what the new plan should be", score: 2 },
      { label: "C", text: "It is hard to move fast enough to course-correct before too much damage is done", score: 3 },
      { label: "D", text: "I continue with the plan - sometimes success is just around the corner and a change of direction is not needed", score: 1 },
    ],
  },
  {
    n: 4,
    stem: "When someone presents a point of view that challenges my beliefs, I most often:",
    options: [
      { label: "A", text: "Ask a lot of questions to check the validity of the data", score: 4 },
      { label: "B", text: "Update my view if the evidence is strong enough", score: 5 },
      { label: "C", text: "Feel defensive initially but come around eventually", score: 2 },
      { label: "D", text: "Depends entirely on who is challenging it", score: 1 },
    ],
  },
  {
    n: 5,
    stem: "If I look at how I spent my thinking time in the last month, most of it went toward:",
    options: [
      { label: "A", text: "Problems and fires that needed immediate resolution", score: 1 },
      { label: "B", text: "Delivering on commitments already made, due within one year", score: 2 },
      { label: "C", text: "Planning and preparing for the next one to two years", score: 3 },
      { label: "D", text: "Thinking about where the industry and business are going in three to five years", score: 5 },
    ],
  },
  {
    n: 6,
    stem: "When I read about a trend, a technology, or a shift happening in my industry or another, my usual reaction is:",
    options: [
      { label: "A", text: "I wonder if this could affect us and how", score: 3 },
      { label: "B", text: "I file it away mentally to act on later", score: 2 },
      { label: "C", text: "I actively explore whether there is something here for us", score: 5 },
      { label: "D", text: "I share it with my team to get their perspective", score: 4 },
    ],
  },
  {
    n: 7,
    stem: "When something genuinely unexpected happens - a market shift, a competitive move, an internal crisis - my first internal response is usually:",
    options: [
      { label: "A", text: "Concern about what this means for my existing plans", score: 2 },
      { label: "B", text: "Curiosity about what this means and what it opens up for me", score: 5 },
      { label: "C", text: "A need to fully understand it before reacting", score: 3 },
      { label: "D", text: "An instinct to protect and double down on what is working right now", score: 2 },
    ],
  },
  {
    n: 8,
    stem: "How quickly do you recognize emerging technological and market shifts before they impact your company or functional strategy?",
    options: [
      { label: "A", text: "We become aware only after it has already impacted us", score: 1 },
      { label: "B", text: "We can typically spot shifts six to twelve months in advance", score: 2 },
      { label: "C", text: "We can typically spot shifts two to three years in advance", score: 3 },
      { label: "D", text: "We actively track weak signals and factor them into long-term strategy", score: 4 },
    ],
  },
];

// ---- Section B: Section 2 (9 questions, max 45) ----
const RELATIONAL: Q[] = [
  {
    n: 1,
    stem: "Decision Alignment: When my team makes a decision...",
    options: [
      { label: "A", text: "People comply but do not always fully commit", score: 1 },
      { label: "B", text: "Some decisions get team alignment but not others - depends on how controversial it is", score: 2 },
      { label: "C", text: "We can consistently converge on a single priority quickly to execute", score: 4 },
      { label: "D", text: "People execute because they genuinely believe in it - not just because it was decided at the top", score: 5 },
    ],
  },
  {
    n: 2,
    stem: "Decision in Complexity: When my team is pulled in different directions or facing a complex situation where the answer is not clear:",
    options: [
      { label: "A", text: "We struggle - complexity often leads to confusion or paralysis at the team level", score: 1 },
      { label: "B", text: "We eventually align but it takes longer than it should and creates friction", score: 2 },
      { label: "C", text: "We align reasonably well - someone usually steps up to create clarity", score: 4 },
      { label: "D", text: "We find a way to simplify and align even when we do not have all the answers - we have a shared way of cutting through complexity and finding the top priority", score: 5 },
    ],
  },
  {
    n: 3,
    stem: "In my team, how do we treat bad news?",
    options: [
      { label: "A", text: "Bad news is raised late - by the time we hear it, it is already an established problem", score: 1 },
      { label: "B", text: "It depends on the person - some raise things before they escalate, some do not", score: 2 },
      { label: "C", text: "Bad news travels up fairly quickly but there are still blind spots we discover late", score: 4 },
      { label: "D", text: "Problems surface early and consistently - people feel safe raising things before they are certain", score: 5 },
    ],
  },
  {
    n: 4,
    stem: "In our team, how do we give feedback?",
    options: [
      { label: "A", text: "Feedback is process-based and people avoid difficult conversations to keep the peace", score: 1 },
      { label: "B", text: "Feedback happens but is often softened to the point where the message gets lost", score: 2 },
      { label: "C", text: "Feedback is generally direct but occasionally becomes personal or creates defensiveness", score: 3 },
      { label: "D", text: "Feedback is frequent, clear, and the team receives it well without taking it personally", score: 5 },
    ],
  },
  {
    n: 5,
    stem: "How does my team operate while working with people with varying levels of experience, personalities, and diverse functions and cultures?",
    options: [
      { label: "A", text: "We experience frequent friction and conflict when working across different teams or cultures and it slows us down", score: 1 },
      { label: "B", text: "We work well within our own team but friction and misalignment tend to surface when we engage across other teams or cultures", score: 2 },
      { label: "C", text: "We generally work well across differences but occasional friction still surfaces and sometimes takes longer to resolve than it should", score: 4 },
      { label: "D", text: "We navigate differences in generation, function, and culture with low friction - conflicts when they arise are resolved quickly and without lasting damage to relationships", score: 5 },
    ],
  },
  {
    n: 6,
    stem: "When a strategic decision is made, how quickly does our team's execution shift to reflect it?",
    options: [
      { label: "A", text: "Slowly - it takes significant time before the decision is visible in how we actually work", score: 1 },
      { label: "B", text: "Moderately - we shift eventually but there is always a gap between decision and action", score: 2 },
      { label: "C", text: "Quickly in most cases - the team generally moves fast when direction is clear", score: 4 },
      { label: "D", text: "Very quickly - once a decision is made the team realigns operations almost immediately", score: 5 },
    ],
  },
  {
    n: 7,
    stem: "When a new priority emerges, how is it treated by our team?",
    options: [
      { label: "A", text: "We rarely reallocate - existing commitments and budgets tend to stay intact even when priorities shift", score: 1 },
      { label: "B", text: "We reallocate partially - some resources shift but there is significant resistance to letting go of existing allocations", score: 2 },
      { label: "C", text: "We reallocate meaningfully in most cases - the team generally supports new priorities with real resources", score: 4 },
      { label: "D", text: "We reallocate visibly and decisively - when a new priority is clear the team moves budget, talent, and focus", score: 5 },
    ],
  },
  {
    n: 8,
    stem: "When a project or initiative is no longer aligned with where we are going, what do we do?",
    options: [
      { label: "A", text: "We rarely shut things down - projects tend to continue long after they should have stopped", score: 1 },
      { label: "B", text: "We sometimes shut things down but it is slow and politically difficult", score: 2 },
      { label: "C", text: "We generally shut things down when it is clearly no longer working, though it takes some convincing", score: 4 },
      { label: "D", text: "We shut things down quickly and without drama when they no longer serve where we are going", score: 5 },
    ],
  },
  {
    n: 9,
    stem: "How does our team respond when a member spots an emerging signal - a market shift, a new technology, or an early trend - that could shape our strategy?",
    options: [
      { label: "A", text: "We seek more information to verify whether it is the right read of the market", score: 1 },
      { label: "B", text: "We test quickly and learn", score: 2 },
      { label: "C", text: "We run the finding through our risk management process and build a business case before acting", score: 4 },
      { label: "D", text: "We trust the team member who identified the signal and move into action", score: 5 },
    ],
  },
];

// ---- Section C: Section 3 (8 questions, max 40) ----
const INNER: Q[] = [
  {
    n: 1,
    stem: "When I am in a high-stakes situation - a crisis, a difficult conversation, a major decision under time pressure - the following happens to my thinking and judgment:",
    options: [
      { label: "A", text: "My focus becomes scattered - I find it hard to grasp what actually matters and get lost in other details", score: 1 },
      { label: "B", text: "My focus narrows - I zoom in and dive deep but may fail to see the wider context and miss things I would normally catch", score: 2 },
      { label: "C", text: "My focus remains consistent - I feel the pressure but it does not significantly affect the quality of my thinking", score: 4 },
      { label: "D", text: "My focus sharpens - high-stakes situations tend to bring out my clearest thinking and enable me to act without unnecessary delay", score: 5 },
    ],
  },
  {
    n: 2,
    stem: "When I am under a long period of stressful work - a difficult quarter, competing demands from all directions - the following happens to my decision-making:",
    options: [
      { label: "A", text: "I get into firefighting mode, become more reactive, short-term focused, and delay complex decisions until they are unavoidable", score: 1 },
      { label: "B", text: "I become more cautious and risk-averse - I take longer to decide because I do not want to make things worse", score: 2 },
      { label: "C", text: "I stay consistent - I notice the pressure but maintain my decision quality and ways of working", score: 4 },
      { label: "D", text: "I remain reliable - I know how sustained pressure affects me and have tools in place to maintain clarity and judgment", score: 5 },
    ],
  },
  {
    n: 3,
    stem: "When the people around me are anxious, stressed, or in conflict, I notice that my own state of mind:",
    options: [
      { label: "A", text: "Gets pulled in - I absorb the emotional atmosphere of the room and it affects my thinking and productivity more than I would like", score: 1 },
      { label: "B", text: "Gets affected but I manage it - I feel the pull but try to maintain my workflow, though it costs me more effort", score: 2 },
      { label: "C", text: "Stays mostly separate - I can feel the tension without it significantly altering my productivity", score: 4 },
      { label: "D", text: "Remains steady and sometimes has a calming effect on others - my regulated state tends to reduce rather than absorb the tension in the room", score: 5 },
    ],
  },
  {
    n: 4,
    stem: "After a hard period - a significant setback, a sustained stretch of pressure, a major conflict - this is how I recover:",
    options: [
      { label: "A", text: "I rarely get time to recover properly and sometimes carry the weight of it into subsequent situations", score: 1 },
      { label: "B", text: "I recover eventually but it takes significant time and deliberate effort", score: 3 },
      { label: "C", text: "I recover with effort and also carve out time to reflect and draw learnings from the experience", score: 3 },
      { label: "D", text: "I recover relatively quickly because I have built practices that help me reset and reflect consistently", score: 5 },
    ],
  },
  {
    n: 5,
    stem: "When I step away from work - evenings, weekends, holidays - I:",
    options: [
      { label: "A", text: "Do not switch off or find it very difficult to - my mind stays in work mode", score: 1 },
      { label: "B", text: "Can stop working but do not feel fully rested and often wish I had more time to recover", score: 2 },
      { label: "C", text: "Generally disconnect and rest reasonably well", score: 4 },
      { label: "D", text: "Meaningfully disconnect and return from time away feeling genuinely more energized than before", score: 5 },
    ],
  },
  {
    n: 6,
    stem: "When I reflect on my purpose - why I lead and why I do this work - I find that:",
    options: [
      { label: "A", text: "This is not something I think about often - I focus on what needs to get done rather than why", score: 1 },
      { label: "B", text: "I have a broad sense of it but it shifts depending on my circumstances", score: 2 },
      { label: "C", text: "I have a clear enough sense of why I lead and it helps me stay oriented, especially when things get hard", score: 4 },
      { label: "D", text: "My sense of purpose is clear and my current work allows me to live it consistently - it is the most stable thing I have", score: 5 },
    ],
  },
  {
    n: 7,
    stem: "When I need to make a judgment call that goes beyond what the data can tell me - a strategic bet, a people decision, a moment where instinct matters - I find that:",
    options: [
      { label: "A", text: "I struggle without clear data - I feel uncertain and tend to delay, defer, or default to what has worked before", score: 1 },
      { label: "B", text: "I can make the call but do not fully trust it - I look for external confirmation even after deciding", score: 2 },
      { label: "C", text: "I generally trust my judgment in these moments and can act on it with reasonable confidence", score: 4 },
      { label: "D", text: "My clearest thinking often happens in these moments - I can access a depth of judgment that feels genuinely reliable even when the situation is complex or uncertain", score: 5 },
    ],
  },
  {
    n: 8,
    stem: "When I think about the effect my presence has on the people around me - my energy, my mood, my level of stress - I would say:",
    options: [
      { label: "A", text: "I am honestly not very aware of it - I focus on the content of what I am doing rather than the energy I am bringing", score: 1 },
      { label: "B", text: "I am aware of it when someone points it out or when I notice a visible reaction from others - but I do not track it proactively", score: 2 },
      { label: "C", text: "I am generally aware of the energy I bring and make a conscious effort to manage it, especially in high-stakes situations", score: 4 },
      { label: "D", text: "My energy uplifts the rooms I am in - people tend to leave conversations with me feeling clearer, more positive, or more resourced than when they arrived", score: 5 },
    ],
  },
];

const DIM_BANDS: Record<string, Array<{ min: number; max: number; label: string; interp: string }>> = {
  "Section 1": [
    { min: 8, max: 13, label: "Critical Gap", interp: "The cognitive infrastructure for leading in complexity is not yet built. Significant and urgent intervention needed." },
    { min: 14, max: 22, label: "At Risk", interp: "Predominantly reactive and backward-looking. Will be increasingly exposed as the pace of change accelerates." },
    { min: 23, max: 30, label: "Developing", interp: "Real capability present but inconsistent. Thinks clearly in familiar territory but struggles when situations are genuinely new." },
    { min: 31, max: 38, label: "Strong", interp: "Genuine cognitive agility. Filters well, adapts fast, thinks ahead, stays curious under pressure." },
  ],
  "Section 2": [
    { min: 9, max: 16, label: "Critical Gap", interp: "The team is operating on relational patterns built for a slower, more stable world. The gaps here are not individual - they are cultural and will require deliberate structural intervention." },
    { min: 17, max: 26, label: "At Risk", interp: "The team's relational dynamics are limiting execution and adaptability. Compliance is mistaken for alignment, feedback is avoided, and change is slower than the business needs." },
    { min: 27, max: 36, label: "Developing", interp: "Real relational capability exists but is inconsistent. The team performs well in familiar conditions and shows friction when situations are complex, cross-cultural, or require letting go of the old." },
    { min: 37, max: 45, label: "Strong", interp: "This team operates with genuine relational maturity. Decisions land, feedback flows, execution is fast, and the team can let go when needed. This is a high-performing team culture." },
  ],
  "Section 3": [
    { min: 8, max: 13, label: "Critical Gap", interp: "The nervous system is running the leader rather than the leader running the nervous system. At this level, inner state dysregulation is a direct business risk - affecting decisions, team culture, and long-term sustainability of performance." },
    { min: 14, max: 23, label: "At Risk", interp: "The leader's inner state is regularly affecting the quality of their judgment, their recovery, and their impact on others. This is not a character issue - it is a capacity issue that can be built with the right practices and support." },
    { min: 24, max: 32, label: "Developing", interp: "Real inner capacity is present but inconsistent. The leader performs well in stable conditions and shows the edges of their inner regulation when pressure is sustained or interpersonal intensity is high." },
    { min: 33, max: 40, label: "Strong", interp: "This dimension is a genuine asset. The leader has the inner foundation to lead reliably under pressure, recover fully, and bring regulated presence to the people around them." },
  ],
};

const OVERALL_BANDS = [
  { min: 25, max: 46, label: "High Risk", interp: "The leadership infrastructure you have today is not fit for what is coming. This is not a criticism of you as an individual - it is a structural gap that has built up over time and needs a fundamental reset, not another training programme." },
  { min: 47, max: 73, label: "Developing Readiness", interp: "Your leadership is operating on a model built for a slower, more predictable world. The gaps across one or more dimensions are significant enough that they are likely already affecting execution, culture, and your ability to attract and retain the right people." },
  { min: 74, max: 99, label: "Partially Ready", interp: "You have real strengths but meaningful gaps. In stable conditions, this works. As AI continues to raise the bar on speed, judgment, and adaptability, these gaps will become more visible and more costly. Now is the time to address them." },
  { min: 100, max: 123, label: "AI-Ready", interp: "You have the leadership foundation to thrive in the AI age. The priority now is staying ahead - building the practices and tools that will keep this edge as the pace of change accelerates." },
];

async function main() {
  const instrument = await prisma.instrument.findFirst({
    include: { currentVersion: true },
  });
  if (!instrument?.currentVersion) {
    throw new Error("no current instrument version");
  }
  const versionId = instrument.currentVersion.id;

  // Abandon any in-progress sessions so scoring changes don't mid-flight-rescore them.
  const abandoned = await prisma.session.updateMany({
    where: { instrumentVersionId: versionId, status: "in_progress" },
    data: { status: "abandoned", abandonedAt: new Date(), whatsappPhone: null },
  });
  console.log(`abandoned ${abandoned.count} in-progress sessions`);

  const sections = await prisma.section.findMany({
    where: { instrumentVersionId: versionId },
    include: {
      dimension: true,
      questions: {
        orderBy: { displayOrder: "asc" },
        include: { options: true },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  const byDimension = new Map(sections.map((s) => [s.dimension.name, s]));

  const plan: Array<{ dimension: string; data: Q[] }> = [
    { dimension: "Section 1", data: COGNITIVE },
    { dimension: "Section 2", data: RELATIONAL },
    { dimension: "Section 3", data: INNER },
  ];

  await prisma.$transaction(async (tx) => {
    for (const { dimension, data } of plan) {
      const section = byDimension.get(dimension);
      if (!section) throw new Error(`missing section ${dimension}`);
      if (section.questions.length !== data.length) {
        throw new Error(
          `question count mismatch for ${dimension}: db=${section.questions.length} pdf=${data.length}`,
        );
      }
      for (const q of data) {
        const existing = section.questions.find((x) => x.displayOrder === q.n);
        if (!existing) throw new Error(`no Q${q.n} in ${dimension}`);
        await tx.question.update({
          where: { id: existing.id },
          data: { stem: q.stem },
        });
        for (const opt of q.options) {
          const existingOpt = existing.options.find((o) => o.label === opt.label);
          if (!existingOpt) throw new Error(`${dimension} Q${q.n} missing option ${opt.label}`);
          await tx.option.update({
            where: { id: existingOpt.id },
            data: { text: opt.text, score: opt.score },
          });
        }
      }
    }

    // Replace dimension bands.
    await tx.dimensionBand.deleteMany({ where: { instrumentVersionId: versionId } });
    for (const section of sections) {
      const bands = DIM_BANDS[section.dimension.name];
      if (!bands) throw new Error(`no band spec for ${section.dimension.name}`);
      for (const b of bands) {
        await tx.dimensionBand.create({
          data: {
            instrumentVersionId: versionId,
            dimensionId: section.dimensionId,
            minScore: b.min,
            maxScore: b.max,
            bandLabel: b.label,
            interpretationTemplate: b.interp,
          },
        });
      }
    }

    // Replace overall bands.
    await tx.overallBand.deleteMany({ where: { instrumentVersionId: versionId } });
    for (const b of OVERALL_BANDS) {
      await tx.overallBand.create({
        data: {
          instrumentVersionId: versionId,
          minScore: b.min,
          maxScore: b.max,
          bandLabel: b.label,
          interpretationTemplate: b.interp,
        },
      });
    }
  });

  console.log("FSL content updated to PDF v2");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
