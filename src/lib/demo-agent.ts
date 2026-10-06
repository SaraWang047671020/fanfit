import type { AgentInput } from "./agent";
import { DEMO_PROJECT, PACKAGE_A, TARGET_AUDIENCE } from "./demo";

export const DEMO_AGENT_INPUT: AgentInput = {
  goal: `${DEMO_PROJECT.goal} Change at most 2 elements.`,
  base: PACKAGE_A,
  audience: { label: TARGET_AUDIENCE.label, seeds: TARGET_AUDIENCE.seeds },
  maxSwaps: 2,
};
