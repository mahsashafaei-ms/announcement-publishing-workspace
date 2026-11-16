import { ANNOUNCEMENT_SCENARIOS } from "../../mocks";
import type { AnnouncementScenario } from "../../mocks";
import { Icon } from "../ui/Icon";

const LABELS: Record<AnnouncementScenario, string> = {
  success: "Success",
  "explicit-rejection": "Explicit rejection",
  "lost-response": "Lost response",
  "status-check-failure": "Status check failure",
  overlapping: "Overlapping operations",
  "slow-response": "Slow response",
};

const DESCRIPTIONS: Record<AnnouncementScenario, string> = {
  success: "The service accepts the attempt and confirms publication after a short delay.",
  "explicit-rejection": "The service declines the new attempt and returns a reason.",
  "lost-response": "The first publish response is lost while publication continues.",
  "status-check-failure": "The first publish response is lost, then the first status read fails.",
  overlapping: "Announcements finish at different times and responses arrive out of order.",
  "slow-response": "Publication can finish before the initial publish response arrives.",
};

interface ScenarioSelectorProps {
  value: AnnouncementScenario;
  onChange: (scenario: AnnouncementScenario) => void;
}

/** The scenario used by the simulated service for NEW operations. */
export function ScenarioSelector({ value, onChange }: ScenarioSelectorProps) {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <label htmlFor="scenario" className="mb-2 block text-xs font-medium">
        Scenario for new attempts
      </label>
      <div className="relative">
        <select
          id="scenario"
          className="min-h-11 w-full appearance-none rounded-md border border-line-strong bg-surface py-2.25 pr-10 pl-3 text-sm"
          value={value}
          onChange={(event) => {
            const next = ANNOUNCEMENT_SCENARIOS.find((name) => name === event.target.value);
            if (next) onChange(next);
          }}
        >
          {ANNOUNCEMENT_SCENARIOS.map((name) => (
            <option key={name} value={name}>
              {LABELS[name]}
            </option>
          ))}
        </select>
        <Icon
          name="chevron"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 rotate-90"
        />
      </div>
      <p className="mt-2 text-xs text-muted">{DESCRIPTIONS[value]}</p>
    </div>
  );
}
